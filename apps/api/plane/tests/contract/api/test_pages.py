# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from django.utils import timezone
from rest_framework import status

from plane.db.models import Page, ProjectPage, Project, ProjectMember


@pytest.fixture
def project(db, workspace, create_user):
    """A project with the api-token user as an active member."""
    project = Project.objects.create(
        name="Test Project", identifier="TP", workspace=workspace, created_by=create_user
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    return project


def make_page(project, user, name, access=0, archived_at=None, description_html="<p></p>"):
    page = Page.objects.create(
        name=name,
        workspace=project.workspace,
        access=access,
        archived_at=archived_at,
        description_html=description_html,
        owned_by=user,
        created_by=user,
        updated_by=user,
    )
    ProjectPage.objects.create(
        workspace=project.workspace, project=project, page=page,
        created_by=user, updated_by=user,
    )
    return page


def list_url(slug, pid):
    return f"/api/v1/workspaces/{slug}/projects/{pid}/pages/"


@pytest.mark.contract
class TestPagesPublicListAPI:
    @pytest.mark.django_db
    def test_list_returns_only_public_nonarchived(self, api_key_client, workspace, project, create_user):
        make_page(project, create_user, "Public Doc", access=0)
        make_page(project, create_user, "Private Doc", access=1)
        make_page(project, create_user, "Archived Doc", access=0, archived_at=timezone.now())

        resp = api_key_client.get(list_url(workspace.slug, project.id))

        assert resp.status_code == status.HTTP_200_OK
        names = {p["name"] for p in resp.data["results"]}
        assert names == {"Public Doc"}
        assert "label_ids" in resp.data["results"][0]
        assert "description_html" not in resp.data["results"][0]  # lite list

    @pytest.mark.django_db
    def test_list_requires_api_key(self, api_client, workspace, project):
        resp = api_client.get(list_url(workspace.slug, project.id))
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED
