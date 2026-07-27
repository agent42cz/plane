# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers

from .base import BaseSerializer
from plane.db.models import Page


class PageSerializer(BaseSerializer):
    """Read-only lite serializer for public page listing."""

    label_ids = serializers.ListField(child=serializers.UUIDField(), required=False)
    project_ids = serializers.ListField(child=serializers.UUIDField(), required=False)

    class Meta:
        model = Page
        fields = [
            "id", "name", "owned_by", "access", "color", "parent",
            "is_locked", "archived_at", "workspace", "created_at",
            "updated_at", "view_props", "logo_props", "label_ids", "project_ids",
        ]
        read_only_fields = fields


class PageDetailSerializer(PageSerializer):
    """Adds the rendered HTML body (used by the retrieve endpoint)."""

    description_html = serializers.CharField(read_only=True)

    class Meta(PageSerializer.Meta):
        fields = PageSerializer.Meta.fields + ["description_html"]
        read_only_fields = fields
