/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { CloseIcon } from "@plane/propel/icons";
// plane imports
import type { TPageFilterProps } from "@plane/types";
import { Tag } from "@plane/ui";
import { replaceUnderscoreIfSnakeCase } from "@plane/utils";
// components
import { AppliedDateFilters } from "@/components/common/applied-filters/date";
import { AppliedMembersFilters } from "@/components/common/applied-filters/members";
import { AppliedLabelsFilters } from "@/components/issues/issue-layouts/filters";
import { useLabel } from "@/hooks/store/use-label";

type Props = {
  appliedFilters: TPageFilterProps;
  handleClearAllFilters: () => void;
  handleRemoveFilter: (key: keyof TPageFilterProps, value: string | null) => void;
  alwaysAllowEditing?: boolean;
  projectId: string;
};

const MEMBERS_FILTERS = new Set(["created_by"]);
const DATE_FILTERS = new Set(["created_at"]);
const LABEL_FILTERS = new Set(["labels"]);

export const PageAppliedFiltersList = observer(function PageAppliedFiltersList(props: Props) {
  const { appliedFilters, handleClearAllFilters, handleRemoveFilter, alwaysAllowEditing, projectId } = props;
  const { t } = useTranslation();
  // store hooks
  const { getProjectLabels } = useLabel();
  const projectLabels = getProjectLabels(projectId);

  if (!appliedFilters) return null;
  if (Object.keys(appliedFilters).length === 0) return null;

  const isEditingAllowed = alwaysAllowEditing;

  return (
    <div className="flex flex-wrap items-stretch gap-2">
      {Object.entries(appliedFilters).map(([key, value]) => {
        const filterKey = key as keyof TPageFilterProps;

        if (!value) return;
        if (Array.isArray(value) && value.length === 0) return;

        return (
          <Tag key={filterKey}>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-11 text-tertiary">{replaceUnderscoreIfSnakeCase(filterKey)}</span>
              {DATE_FILTERS.has(filterKey) && (
                <AppliedDateFilters
                  editable={isEditingAllowed}
                  handleRemove={(val) => handleRemoveFilter(filterKey, val)}
                  values={Array.isArray(value) ? value : []}
                />
              )}
              {MEMBERS_FILTERS.has(filterKey) && (
                <AppliedMembersFilters
                  editable={isEditingAllowed}
                  handleRemove={(val) => handleRemoveFilter(filterKey, val)}
                  values={Array.isArray(value) ? value : []}
                />
              )}
              {LABEL_FILTERS.has(filterKey) && (
                <AppliedLabelsFilters
                  editable={isEditingAllowed}
                  handleRemove={(val) => handleRemoveFilter(filterKey, val)}
                  labels={projectLabels}
                  values={Array.isArray(value) ? value : []}
                />
              )}
              {isEditingAllowed && (
                <button
                  type="button"
                  className="grid place-items-center text-tertiary hover:text-secondary"
                  onClick={() => handleRemoveFilter(filterKey, null)}
                >
                  <CloseIcon height={12} width={12} strokeWidth={2} />
                </button>
              )}
            </div>
          </Tag>
        );
      })}
      {isEditingAllowed && (
        <button type="button" onClick={handleClearAllFilters}>
          <Tag>
            {t("common.clear_all")}
            <CloseIcon height={12} strokeWidth={2} />
          </Tag>
        </button>
      )}
    </div>
  );
});
