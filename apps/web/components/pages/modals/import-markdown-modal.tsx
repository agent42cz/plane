/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane constants
import { EPageAccess } from "@plane/constants";
// plane imports
import { Button } from "@makeplane/propel/components/button";
import { Dialog, DialogActions, DialogContent, DialogMain, DialogTitle } from "@makeplane/propel/components/dialog";
import { TextAreaField } from "@makeplane/propel/components/text-area-field";
import { setToast } from "@plane/blocks/toast";
import type { TPage } from "@plane/types";
// components
import { LabelSelect } from "@/components/dropdowns/label/label-select";
// hooks
import { useAppRouter } from "@/hooks/use-app-router";
import { EPageStoreType, usePageStore } from "@/hooks/store";
// plane utils
import { convertMarkdownToHTML, deriveNameFromMarkdown } from "@plane/utils";

type Props = {
  isOpen: boolean;
  handleClose: () => void;
};

const MAX_MARKDOWN_BYTES = 2 * 1024 * 1024; // 2 MB

export const ImportMarkdownModal = observer(function ImportMarkdownModal(props: Props) {
  const { isOpen, handleClose } = props;
  // states
  const [fileName, setFileName] = useState<string | undefined>(undefined);
  const [fileText, setFileText] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  // refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  // router
  const router = useAppRouter();
  const { workspaceSlug, projectId } = useParams();
  // store hooks
  const { createPage } = usePageStore(EPageStoreType.PROJECT);

  const resetState = () => {
    setFileName(undefined);
    setFileText("");
    setPastedText("");
    setSelectedLabelIds([]);
  };

  const handleCloseModal = () => {
    resetState();
    handleClose();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setFileText(text);
      setFileName(file.name);
    } catch (error) {
      console.error("Failed to read file:", error);
      setToast({
        type: "error",
        title: "Error!",
        message: "Could not read the selected file. Please try again.",
      });
    } finally {
      // reset file input so the same file can be re-selected later
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleImport = async () => {
    const markdown = fileText || pastedText;
    if (!markdown.trim()) {
      setToast({
        type: "error",
        title: "Error!",
        message: "Nothing to import. Choose a Markdown file or paste some Markdown text.",
      });
      return;
    }
    if (markdown.length > MAX_MARKDOWN_BYTES) {
      setToast({
        type: "error",
        title: "Error!",
        message: "Soubor je příliš velký (max 2 MB).",
      });
      return;
    }
    if (!workspaceSlug || !projectId) return;

    setIsImporting(true);
    try {
      const name = deriveNameFromMarkdown(markdown, fileName);
      const description_html = convertMarkdownToHTML(markdown);
      const payload: Partial<TPage> = {
        name,
        access: EPageAccess.PUBLIC,
        description_html,
      };
      (payload as TPage & { labels?: string[] }).labels = selectedLabelIds;

      const res = await createPage(payload);
      if (res?.id) {
        resetState();
        handleClose();
        router.push(`/${workspaceSlug}/projects/${projectId}/pages/${res.id}`);
      } else {
        setToast({ type: "error", title: "Error!", message: "Stránku se nepodařilo vytvořit." });
      }
    } catch (error: any) {
      const errorCode = error?.error_code ?? error?.data?.error_code;
      setToast({
        type: "error",
        title: "Error!",
        message:
          errorCode === "content_too_large"
            ? "This file is too large to import. Please try a smaller file."
            : error?.data?.error || error?.error || "Page could not be imported. Please try again.",
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleCloseModal();
      }}
    >
      <DialogContent size="lg">
        <DialogMain>
          <DialogTitle>Import Markdown</DialogTitle>

          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.markdown"
              onChange={handleFileChange}
              className="hidden"
            />
            <Button
              variant="secondary"
              size="md"
              stretch="auto"
              type="button"
              label="Choose file"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
            />
            {fileName && <span className="truncate text-caption-md-regular text-tertiary">{fileName}</span>}
          </div>

          <TextAreaField
            size="lg"
            id="import-markdown-textarea"
            label="Or paste Markdown"
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            placeholder="# Paste your Markdown here"
            rows={8}
          />

          <div className="flex flex-col gap-1">
            <span className="text-caption-md-medium text-secondary">Client label</span>
            <div>
              <LabelSelect
                projectId={projectId?.toString()}
                value={selectedLabelIds}
                onChange={setSelectedLabelIds}
                placeholder="Labels"
                variant="pill-md"
              />
            </div>
          </div>
        </DialogMain>
        <DialogActions>
          <Button
            variant="secondary"
            size="md"
            stretch="auto"
            label="Cancel"
            onClick={handleCloseModal}
            disabled={isImporting}
          />
          <Button
            variant="primary"
            size="md"
            stretch="auto"
            label={isImporting ? "Importing" : "Import"}
            onClick={handleImport}
            loading={isImporting}
          />
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
});
