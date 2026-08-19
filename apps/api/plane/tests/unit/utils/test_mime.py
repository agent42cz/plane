# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest

from plane.utils.mime import (
    invalid_attachment_type_error,
    is_allowed_attachment_mime,
    normalize_mime_type,
)


@pytest.mark.unit
class TestNormalizeMimeType:
    """Test MIME type normalisation"""

    def test_strips_parameters_and_case(self):
        assert normalize_mime_type("TEXT/CSV; charset=UTF-8") == "text/csv"

    def test_strips_surrounding_whitespace(self):
        assert normalize_mime_type("  application/pdf  ") == "application/pdf"

    @pytest.mark.parametrize("value", ["", None, False, 123])
    def test_returns_empty_string_for_non_strings(self, value):
        assert normalize_mime_type(value) == ""


@pytest.mark.unit
class TestIsAllowedAttachmentMime:
    """Test the attachment allowlist check"""

    def test_allows_a_plain_spreadsheet(self):
        assert (
            is_allowed_attachment_mime("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") is True
        )

    def test_allows_a_macro_enabled_workbook(self):
        assert is_allowed_attachment_mime("application/vnd.ms-excel.sheet.macroEnabled.12") is True

    def test_allows_a_macro_enabled_workbook_lower_cased(self):
        """Signature sniffers report this type lower-cased, so the check must be case-insensitive."""
        assert is_allowed_attachment_mime("application/vnd.ms-excel.sheet.macroenabled.12") is True

    def test_allows_a_type_carrying_a_charset_parameter(self):
        assert is_allowed_attachment_mime("text/csv; charset=utf-8") is True

    @pytest.mark.parametrize("value", ["", None, False])
    def test_rejects_a_missing_type(self, value):
        assert is_allowed_attachment_mime(value) is False

    def test_rejects_a_type_outside_the_allowlist(self):
        assert is_allowed_attachment_mime("application/x-msdownload") is False


@pytest.mark.unit
class TestInvalidAttachmentTypeError:
    """Test that a rejection names the offending type"""

    def test_names_the_rejected_type(self):
        payload = invalid_attachment_type_error("application/x-msdownload")
        assert payload["file_type"] == "application/x-msdownload"
        assert "application/x-msdownload" in payload["error"]
        assert payload["status"] is False

    def test_explains_an_undeterminable_type(self):
        payload = invalid_attachment_type_error("")
        assert payload["file_type"] == ""
        assert "could not be determined" in payload["error"]
