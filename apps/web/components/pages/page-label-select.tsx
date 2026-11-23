/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// components
import { LabelSelect } from "@/components/dropdowns/label/label-select";
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
  // read-only viewer with no (existing) labels: render nothing
  if (disabled && !labelIds.some((labelId) => getLabelById(labelId))) return null;

  return (
    <LabelSelect
      projectId={projectId}
      value={labelIds}
      onChange={onChange}
      disabled={disabled}
      placeholder="Labels"
      variant="pill-sm"
    />
  );
});
