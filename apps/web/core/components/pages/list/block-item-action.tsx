/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Earth, Info, Minus } from "lucide-react";
// plane imports
import { LockIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import { Avatar, FavoriteStar } from "@plane/ui";
import { renderFormattedDate, getFileURL } from "@plane/utils";
// components
import { IssueLabelSelect } from "@/components/issues/select";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useLabel } from "@/hooks/store/use-label";
import { usePageOperations } from "@/hooks/use-page-operations";
// plane web hooks
import type { EPageStoreType } from "@/hooks/store";
// store
import type { TPageInstance } from "@/store/pages/base-page";
// local imports
import { PageActions } from "../dropdowns";

type Props = {
  page: TPageInstance;
  parentRef: React.RefObject<HTMLElement>;
  storeType: EPageStoreType;
};

export const BlockItemAction = observer(function BlockItemAction(props: Props) {
  const { page, parentRef, storeType } = props;
  // store hooks
  const { getUserDetails } = useMember();
  const { getLabelById } = useLabel();
  // page operations
  const { pageOperations } = usePageOperations({
    page,
  });
  // derived values
  const {
    access,
    created_at,
    is_favorite,
    owned_by,
    canCurrentUserFavoritePage,
    canCurrentUserEditPage,
    label_ids,
    project_ids,
  } = page;
  const ownerDetails = owned_by ? getUserDetails(owned_by) : undefined;
  const projectId = project_ids?.[0];

  return (
    <>
      {/* labels — editable for members, read-only chips otherwise */}
      {canCurrentUserEditPage ? (
        <IssueLabelSelect
          value={label_ids ?? []}
          projectId={projectId}
          onChange={(labelIds) => page.updatePageLabels(labelIds)}
        />
      ) : label_ids && label_ids.length > 0 ? (
        <span className="flex flex-shrink-0 items-center gap-1">
          {label_ids
            .map((labelId) => getLabelById(labelId))
            .filter((label) => !!label)
            .map((label) => (
              <span
                key={label.id}
                className="flex items-center gap-1 rounded-sm bg-layer-1 px-1.5 py-0.5 text-11 text-tertiary"
              >
                <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: label.color }} />
                <span className="normal-case">{label.name}</span>
              </span>
            ))}
        </span>
      ) : null}
      {/* page details */}
      <div className="cursor-default">
        <Tooltip tooltipHeading="Owned by" tooltipContent={ownerDetails?.display_name}>
          <Avatar src={getFileURL(ownerDetails?.avatar_url ?? "")} name={ownerDetails?.display_name} />
        </Tooltip>
      </div>
      <div className="cursor-default text-tertiary">
        <Tooltip tooltipContent={access === 0 ? "Public" : "Private"}>
          {access === 0 ? <Earth className="h-4 w-4" /> : <LockIcon className="h-4 w-4" />}
        </Tooltip>
      </div>
      {/* vertical divider */}
      <Minus className="-mx-3 h-5 w-5 rotate-90 text-placeholder" strokeWidth={1} />

      {/* page info */}
      <Tooltip tooltipContent={`Created on ${renderFormattedDate(created_at)}`}>
        <span className="grid h-4 w-4 cursor-default place-items-center">
          <Info className="h-4 w-4 text-tertiary" />
        </span>
      </Tooltip>

      {/* favorite/unfavorite */}
      {canCurrentUserFavoritePage && (
        <FavoriteStar
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            pageOperations.toggleFavorite();
          }}
          selected={is_favorite}
        />
      )}

      {/* quick actions dropdown */}
      <PageActions
        optionsOrder={[
          "open-in-new-tab",
          "copy-link",
          "make-a-copy",
          "toggle-lock",
          "toggle-access",
          "archive-restore",
          "delete",
        ]}
        page={page}
        parentRef={parentRef}
        storeType={storeType}
      />
    </>
  );
});
