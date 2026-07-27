# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.api.views import PageListAPIEndpoint, PageDetailAPIEndpoint


urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/",
        PageListAPIEndpoint.as_view(http_method_names=["get"]),
        name="page",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:pk>/",
        PageDetailAPIEndpoint.as_view(http_method_names=["get"]),
        name="page",
    ),
]
