/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

export function convertMarkdownToHTML(markdown: string): string {
  const file = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeStringify)
    .processSync(markdown || "");
  return String(file);
}

export function deriveNameFromMarkdown(markdown: string, filename?: string): string {
  const h1 = markdown.match(/^\s*#\s+(.+?)\s*$/m);
  if (h1) return h1[1].trim();
  if (filename) return filename.replace(/\.(md|markdown)$/i, "").trim() || "Untitled";
  return "Untitled";
}
