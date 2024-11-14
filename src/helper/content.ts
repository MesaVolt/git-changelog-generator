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

const decodeMIME = (encodedStr: string): string => {
  // Remove whitespace and split at encoded-word boundaries
  const parts = encodedStr.replace(/\s+/g, '').split(/=\?UTF-8\?q\?(.*?)\?=/gi).filter(Boolean);

  return parts.map(part => {
    // Decode the encoded part
    return decodeURIComponent(part.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, '%$1'));
  }).join('');
};

/**
 * Some patch strings (either author name, or commit name) are utf-8 encoded,
 * and start with "=?UTF-8?q?".
 */
export const decodeUtf8String = (string: string): string => {
  if (string.indexOf('=?UTF-8?') === 0) {
    console.log('Detected encoded: ', string);
    string = decodeMIME(string);
    console.log('Decoded: ', string);
  }
  return string;
}

export const generateCommitLink = (repositoryUrl: string|null, commitHash: string): string => {
  if (repositoryUrl === null) {
    return commitHash;
  }

  // Remove trailing slash
  repositoryUrl = repositoryUrl.replace(/\/$/, '');

  let commitUrl = null;
  if (repositoryUrl.includes('github')) {
    commitUrl = `${repositoryUrl}/commit/${commitHash}`;
  } else if (repositoryUrl.includes('gitlab')) {
    commitUrl = `${repositoryUrl}/-/commit/${commitHash}`;
  }

  return commitUrl !== null
    ? `[${commitHash}](${commitUrl})`
    : commitHash;
}
