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
import { Button } from "@plane/propel/button";
import { setToast, TOAST_TYPE } from "@plane/propel/toast";
import type { TPage } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore, TextArea } from "@plane/ui";
// components
import { IssueLabelSelect } from "@/components/issues/select";
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
        type: TOAST_TYPE.ERROR,
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
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: "Nothing to import. Choose a Markdown file or paste some Markdown text.",
      });
      return;
    }
    if (markdown.length > MAX_MARKDOWN_BYTES) {
      setToast({
        type: TOAST_TYPE.ERROR,
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
        setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Stránku se nepodařilo vytvořit." });
      }
    } catch (error: any) {
      const errorCode = error?.error_code ?? error?.data?.error_code;
      setToast({
        type: TOAST_TYPE.ERROR,
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
    <ModalCore isOpen={isOpen} handleClose={handleCloseModal} position={EModalPosition.TOP} width={EModalWidth.XXL}>
      <div className="space-y-5 p-5">
        <h3 className="text-18 font-medium text-secondary">Import Markdown</h3>

        <div className="space-y-2">
          <input ref={fileInputRef} type="file" accept=".md,.markdown" onChange={handleFileChange} className="hidden" />
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
            >
              Choose file
            </Button>
            {fileName && <span className="truncate text-12 text-tertiary">{fileName}</span>}
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="import-markdown-textarea" className="text-12 font-medium text-secondary">
            Or paste Markdown
          </label>
          <TextArea
            id="import-markdown-textarea"
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            placeholder="# Paste your Markdown here"
            className="min-h-[160px] w-full resize-none text-14"
          />
        </div>

        <div className="space-y-1">
          <span className="text-12 font-medium text-secondary">Client label</span>
          <div>
            <IssueLabelSelect
              value={selectedLabelIds}
              onChange={setSelectedLabelIds}
              projectId={projectId?.toString()}
            />
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t-[0.5px] border-subtle px-5 py-4">
        <Button variant="secondary" size="lg" onClick={handleCloseModal} disabled={isImporting}>
          Cancel
        </Button>
        <Button variant="primary" size="lg" onClick={handleImport} loading={isImporting}>
          {isImporting ? "Importing" : "Import"}
        </Button>
      </div>
    </ModalCore>
  );
});
