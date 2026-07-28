/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { LabelPropertyIcon } from "@plane/propel/icons";
// components
import { IssueLabelSelect } from "@/components/issues/select";
// hooks
import { useLabel } from "@/hooks/store/use-label";

type Props = {
  labelIds: string[];
  projectId: string | undefined;
  onChange: (labelIds: string[]) => void;
  disabled?: boolean;
};

export const PageLabelSelect = observer(function PageLabelSelect(props: Props) {
  const { labelIds, projectId, onChange, disabled = false } = props;
  // store hooks
  const { getLabelById } = useLabel();
  // derived values
  const labels = labelIds.map((labelId) => getLabelById(labelId)).filter((label) => !!label);
  // read-only viewer with no labels: render nothing
  if (disabled && labels.length === 0) return null;

  return (
    <IssueLabelSelect
      value={labelIds}
      projectId={projectId}
      onChange={onChange}
      disabled={disabled}
      label={
        labels.length > 0 ? (
          <span className="flex flex-shrink-0 items-center gap-1">
            {labels.slice(0, 2).map((label) => (
              <span
                key={label.id}
                className="flex items-center gap-1 rounded-sm bg-layer-1 px-1.5 py-0.5 text-11 text-tertiary"
              >
                <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: label.color }} />
                <span className="normal-case">{label.name}</span>
              </span>
            ))}
            {labels.length > 2 ? (
              <span className="rounded-sm bg-layer-1 px-1.5 py-0.5 text-11 text-tertiary">+{labels.length - 2}</span>
            ) : null}
          </span>
        ) : (
          <span className="flex items-center gap-1 rounded-sm border-[0.5px] border-strong px-2 py-1 text-11 text-tertiary hover:bg-layer-1">
            <LabelPropertyIcon className="h-3 w-3 flex-shrink-0" />
            <span>Labels</span>
          </span>
        )
      }
    />
  );
});
