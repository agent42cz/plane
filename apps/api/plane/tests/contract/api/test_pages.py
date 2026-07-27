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

    @pytest.mark.django_db
    def test_list_includes_sub_pages(self, api_key_client, workspace, project, create_user):
        parent = make_page(project, create_user, "Parent Doc", access=0)
        child = Page.objects.create(
            name="Child Doc",
            workspace=project.workspace,
            access=0,
            parent=parent,
            owned_by=create_user,
            created_by=create_user,
            updated_by=create_user,
        )
        ProjectPage.objects.create(
            workspace=project.workspace, project=project, page=child,
            created_by=create_user, updated_by=create_user,
        )

        resp = api_key_client.get(list_url(workspace.slug, project.id))

        assert resp.status_code == status.HTTP_200_OK
        names = {p["name"] for p in resp.data["results"]}
        assert names == {"Parent Doc", "Child Doc"}

    @pytest.mark.django_db
    def test_list_excludes_pages_from_other_project(self, api_key_client, workspace, project, create_user):
        make_page(project, create_user, "Public Doc", access=0)

        other_project = Project.objects.create(
            name="Other Project", identifier="OP", workspace=workspace, created_by=create_user
        )
        make_page(other_project, create_user, "Other Project Doc", access=0)

        resp = api_key_client.get(list_url(workspace.slug, project.id))

        assert resp.status_code == status.HTTP_200_OK
        names = {p["name"] for p in resp.data["results"]}
        assert names == {"Public Doc"}

    @pytest.mark.django_db
    def test_list_excludes_page_when_user_not_member_of_queried_project(
        self, api_key_client, workspace, project, create_user
    ):
        """A page shared into projects {A, B} must not be visible under B's URL
        for a user who is only an active member of A.

        Regresses a bug where the queryset chained separate .filter() calls on
        the `projects` M2M, letting the membership predicate and the project_id
        predicate be satisfied by different joined rows.
        """
        project_a = project  # api-token user IS an active member (fixture default)
        project_b = Project.objects.create(
            name="Project B", identifier="PB", workspace=workspace, created_by=create_user
        )
        # Note: no ProjectMember row for create_user on project_b.

        page = make_page(project_a, create_user, "Shared Doc", access=0)
        ProjectPage.objects.create(
            workspace=workspace, project=project_b, page=page,
            created_by=create_user, updated_by=create_user,
        )

        # Sanity: visible under A's list URL.
        resp_a = api_key_client.get(list_url(workspace.slug, project_a.id))
        assert resp_a.status_code == status.HTTP_200_OK
        assert {p["name"] for p in resp_a.data["results"]} == {"Shared Doc"}

        # Must be absent under B's list URL (user is not a member of B).
        resp_b = api_key_client.get(list_url(workspace.slug, project_b.id))
        assert resp_b.status_code == status.HTTP_200_OK
        assert page.id not in {p["id"] for p in resp_b.data["results"]}

        # Retrieve under B's URL must 404.
        detail_resp_b = api_key_client.get(detail_url(workspace.slug, project_b.id, page.id))
        assert detail_resp_b.status_code == status.HTTP_404_NOT_FOUND


def detail_url(slug, pid, pk):
    return f"/api/v1/workspaces/{slug}/projects/{pid}/pages/{pk}/"


@pytest.mark.contract
class TestPagesPublicRetrieveAPI:
    @pytest.mark.django_db
    def test_retrieve_returns_description_html(self, api_key_client, workspace, project, create_user):
        page = make_page(project, create_user, "Doc", access=0, description_html="<p>Hello</p>")
        resp = api_key_client.get(detail_url(workspace.slug, project.id, page.id))
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["name"] == "Doc"
        assert resp.data["description_html"] == "<p>Hello</p>"

    @pytest.mark.django_db
    def test_retrieve_private_page_is_404(self, api_key_client, workspace, project, create_user):
        page = make_page(project, create_user, "Secret", access=1)
        resp = api_key_client.get(detail_url(workspace.slug, project.id, page.id))
        assert resp.status_code == status.HTTP_404_NOT_FOUND
