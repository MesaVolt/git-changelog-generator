import libmime from 'libmime';

export const samplePatch = `From 691ec486bc9f69669a00cf1920ea8a3b03974e78 Mon Sep 17 00:00:00 2001
From: Harvey Specter <hspecter@pearson-hardman.com>
Date: Tue, 14 Sep 2021 15:16:41 +0200
Subject: [PATCH] Fix search field focus on load

---
 src/App.vue | 10 ++++++++--
 1 file changed, 8 insertions(+), 2 deletions(-)

diff --git a/src/App.vue b/src/App.vue
index 864e092..03eccbb 100644
--- a/src/App.vue
+++ b/src/App.vue
@@ -64,9 +64,11 @@
       </div>
       <div class="search-wrap">
         <input
-          class="search" type="text"
-          placeholder="Search…" autofocus
+          class="search"
+          type="text"
+          placeholder="Search…"
           v-model="search"
+          ref="search"
         />
         <i
           class="search-clear mdi mdi-close"
@@ -331,6 +333,10 @@ export default defineComponent({
     this.browserScrollbarWidth = getScrollbarWidth();

     document.dispatchEvent(new Event('prerender-ready'));
+
+    // Give focus to search field
+    const searchInput = this.$refs.search as HTMLInputElement;
+    searchInput.focus();
   },
   methods: {
     setActiveIcon(icon: Icon|null): void {
--
2.33.0
`;

export const utf8Headers = `MIME-Version: 1.0
Content-Type: text/plain; charset=UTF-8
Content-Transfer-Encoding: 8bit`;

/**
 * Some patch strings (either author name, or commit name) are utf-8 encoded,
 * and start with "=?UTF-8?q?".
 */
export const decodeUtf8String = (string: string): string => {
  if (string.indexOf('=?UTF-8?') === 0) {
    string = libmime.decodeWords(string);
  }
  return string;
}
