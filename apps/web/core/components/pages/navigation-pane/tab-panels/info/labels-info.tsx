/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// components
import { IssueLabelSelect } from "@/components/issues/select";
// store
import type { TPageInstance } from "@/store/pages/base-page";

type Props = {
  page: TPageInstance;
};

export const PageNavigationPaneInfoTabLabelsInfo = observer(function PageNavigationPaneInfoTabLabelsInfo(props: Props) {
  const { page } = props;
  // derived values
  const { label_ids, project_ids, canCurrentUserEditPage } = page;
  const projectId = project_ids?.[0];
  // nothing to show for a read-only viewer with no labels
  if (!canCurrentUserEditPage && (!label_ids || label_ids.length === 0)) return null;

  return (
    <div className="mt-4">
      <p className="text-11 font-medium text-tertiary">Labels</p>
      <div className="mt-2">
        <IssueLabelSelect
          value={label_ids ?? []}
          projectId={projectId}
          onChange={(labelIds) => page.updatePageLabels(labelIds)}
          disabled={!canCurrentUserEditPage}
        />
      </div>
    </div>
  );
});
