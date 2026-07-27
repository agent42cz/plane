# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.contrib.postgres.aggregates import ArrayAgg
from django.contrib.postgres.fields import ArrayField
from django.db.models import Q, UUIDField, Value
from django.db.models.functions import Coalesce
from rest_framework import status
from rest_framework.response import Response

from plane.api.serializers import PageSerializer, PageDetailSerializer
from plane.api.views.base import BaseAPIView
from plane.app.permissions import ProjectMemberPermission
from plane.db.models import Page


class PageListAPIEndpoint(BaseAPIView):
    """List public, non-archived pages in a project (read-only)."""

    serializer_class = PageSerializer
    model = Page
    permission_classes = [ProjectMemberPermission]
    use_read_replica = True

    def get_queryset(self):
        return (
            Page.objects.filter(workspace__slug=self.kwargs.get("slug"))
            .filter(projects__id=self.kwargs.get("project_id"))
            .filter(
                projects__project_projectmember__member=self.request.user,
                projects__project_projectmember__is_active=True,
            )
            .filter(projects__archived_at__isnull=True)
            .filter(access=0, archived_at__isnull=True)
            .annotate(
                label_ids=Coalesce(
                    ArrayAgg(
                        "page_labels__label_id",
                        distinct=True,
                        filter=~Q(page_labels__label_id__isnull=True),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
                project_ids=Coalesce(
                    ArrayAgg(
                        "projects__id",
                        distinct=True,
                        filter=~Q(projects__id__isnull=True),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
            )
            .select_related("workspace", "owned_by")
            .distinct()
            .order_by("-created_at")
        )

    def get(self, request, slug, project_id):
        return self.paginate(
            request=request,
            queryset=self.get_queryset(),
            on_results=lambda pages: PageSerializer(
                pages, many=True, fields=self.fields, expand=self.expand
            ).data,
        )


class PageDetailAPIEndpoint(PageListAPIEndpoint):
    """Retrieve a single public page including its rendered HTML."""

    def get(self, request, slug, project_id, pk):
        page = self.get_queryset().get(pk=pk)
        serializer = PageDetailSerializer(page)
        return Response(serializer.data, status=status.HTTP_200_OK)
