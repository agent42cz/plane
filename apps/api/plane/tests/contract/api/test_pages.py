# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from django.utils import timezone
from rest_framework import status

from uuid import uuid4

from plane.db.models import APIToken, Page, ProjectPage, Project, ProjectMember, User, WorkspaceMember


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

        # B's URLs are denied outright: ProjectMemberPermission requires membership of the URL project.
        resp_b = api_key_client.get(list_url(workspace.slug, project_b.id))
        assert resp_b.status_code == status.HTTP_403_FORBIDDEN

        detail_resp_b = api_key_client.get(detail_url(workspace.slug, project_b.id, page.id))
        assert detail_resp_b.status_code == status.HTTP_403_FORBIDDEN


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


def make_guest_client(api_client, workspace, project):
    """An API client for an active GUEST (role=5) of ``project``."""
    unique_id = uuid4().hex[:8]
    guest = User.objects.create(email=f"guest-{unique_id}@plane.so", username=f"guest_{unique_id}")
    WorkspaceMember.objects.create(workspace=workspace, member=guest, role=5)
    ProjectMember.objects.create(project=project, member=guest, workspace=workspace, role=5, is_active=True)
    token = APIToken.objects.create(user=guest, label="Guest Token")
    api_client.credentials(HTTP_X_API_KEY=token.token)
    return api_client, guest


@pytest.mark.contract
class TestPagesPublicGuestScope:
    """Mirrors ProjectPagePermission in the app: a guest on a project without
    guest_view_all_features only sees the pages they own."""

    @pytest.mark.django_db
    def test_restricted_guest_sees_only_own_pages(self, api_client, workspace, project, create_user):
        client, guest = make_guest_client(api_client, workspace, project)
        foreign = make_page(project, create_user, "Admin Doc", access=0)
        make_page(project, guest, "Guest Doc", access=0)

        resp = client.get(list_url(workspace.slug, project.id))
        assert resp.status_code == status.HTTP_200_OK
        assert {p["name"] for p in resp.data["results"]} == {"Guest Doc"}

        detail = client.get(detail_url(workspace.slug, project.id, foreign.id))
        assert detail.status_code == status.HTTP_404_NOT_FOUND

    @pytest.mark.django_db
    def test_guest_with_view_all_sees_all_public_pages(self, api_client, workspace, project, create_user):
        project.guest_view_all_features = True
        project.save(update_fields=["guest_view_all_features"])
        client, guest = make_guest_client(api_client, workspace, project)
        make_page(project, create_user, "Admin Doc", access=0)
        make_page(project, guest, "Guest Doc", access=0)

        resp = client.get(list_url(workspace.slug, project.id))
        assert resp.status_code == status.HTTP_200_OK
        assert {p["name"] for p in resp.data["results"]} == {"Admin Doc", "Guest Doc"}


@pytest.mark.contract
class TestPagesPublicRemovedProjectLink:
    @pytest.mark.django_db
    def test_page_removed_from_project_is_hidden(self, api_key_client, workspace, project, create_user):
        page = make_page(project, create_user, "Removed Doc", access=0)
        ProjectPage.objects.filter(project=project, page=page).update(deleted_at=timezone.now())

        resp = api_key_client.get(list_url(workspace.slug, project.id))
        assert resp.status_code == status.HTTP_200_OK
        assert page.id not in {p["id"] for p in resp.data["results"]}

        detail = api_key_client.get(detail_url(workspace.slug, project.id, page.id))
        assert detail.status_code == status.HTTP_404_NOT_FOUND
