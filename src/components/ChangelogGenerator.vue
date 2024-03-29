<template>
  <div class="app">
    <header>
      <h1>Git Changelog Generator</h1>
    </header>
    <div class="content">
      <div v-if="step === Step.AskForDiff" class="ask-for-diff">
        <div class="card">
          <div class="card-header">
            <h2 class="card-title">Git patch</h2>
          </div>
          <div class="card-body">
            <textarea v-model="diff" />
            <div class="placeholder" v-show="diff.length === 0">{{samplePatch}}</div>
            <div class="help" v-show="diff.length === 0">
              <h2>Git patch</h2>

              <p>Paste patch here</p>
              <p class="text-muted">For GitHub pull requests, append <code>.patch</code> to its URL:<br /><code>https://github.com/org/repo/pull/1234<u>.patch</u></code></p>
            </div>
          </div>
        </div>
        <div class="floating-action" :class="{visible: diff.length > 0}">
          <button @click="parseDiff">
            <svg width="24" height="24" viewBox="0 0 24 24"><path d="M17 22V20H20V17H22V20.5C22 20.89 21.84 21.24 21.54 21.54C21.24 21.84 20.89 22 20.5 22H17M7 22H3.5C3.11 22 2.76 21.84 2.46 21.54C2.16 21.24 2 20.89 2 20.5V17H4V20H7V22M17 2H20.5C20.89 2 21.24 2.16 21.54 2.46C21.84 2.76 22 3.11 22 3.5V7H20V4H17V2M7 2V4H4V7H2V3.5C2 3.11 2.16 2.76 2.46 2.46C2.76 2.16 3.11 2 3.5 2H7M10.5 6C13 6 15 8 15 10.5C15 11.38 14.75 12.2 14.31 12.9L17.57 16.16L16.16 17.57L12.9 14.31C12.2 14.75 11.38 15 10.5 15C8 15 6 13 6 10.5C6 8 8 6 10.5 6M10.5 8C9.12 8 8 9.12 8 10.5C8 11.88 9.12 13 10.5 13C11.88 13 13 11.88 13 10.5C13 9.12 11.88 8 10.5 8Z" /></svg>
            Analyze
          </button>
        </div>
      </div>
      <div v-if="step === Step.BuildChangelog" class="changelog-builder">
        <div class="commits card">
          <div class="card-header">
            <h2 class="card-title">Commits</h2>
          </div>

          <div class="card-body">
            <div
              :key="commit.hash"
              v-for="commit in commits"
              class="commit"
              :class="{added: commit.added}"
              @click="toggle(commit)"
            >
              <input type="checkbox" :checked="newEntry.commits.includes(commit)" />

              <div>
                <p class="commit-title">{{ commit.message.split("\n")[0] }}</p>
                <p v-if="commit.messageMore" style="opacity: 0.5; font-size: 0.8em" class="commit-more white-space-pre">{{ commit.messageMore }}</p>
              </div>

              <span class="meta">
                <code>{{ commit.hash }}</code><br />
                <span :title="commit.email">
                  {{ commit.username }}
                </span><br />
                <strong><code><span class="additions">+{{ commit.additions }}</span> <span class="deletions">-{{ commit.deletions }}</span></code></strong>
              </span>
            </div>
          </div>
        </div>

        <div class="sidebar">
          <div class="card changelog-preview">
            <div class="card-header">
              <h2 class="card-title">Preview</h2>
            </div>
            <div class="card-body">
              <div class="changelog-as-html markdown-html" v-html="changelogAsHTML"></div>
            </div>
          </div>

          <div class="card changelog-markdown">
            <div class="card-header">
              <h2 class="card-title">Markdown</h2>
            </div>
            <div class="card-body">
              <textarea readonly ref="changelogInput" v-model="changelogAsMarkdown"></textarea>
            </div>
            <div class="card-footer">
              <button type="button" @click="copy">Copy to clipboard</button>
            </div>
          </div>
        </div>

        <form @submit="addEntry" class="new-changelog-item floating-action" :class="{visible: newEntry.commits.length > 0}">
          <input type="text" v-model="newEntry.text" ref="newEntryText" />
          <button type="submit" :disabled="!newEntry.text.length">
            Add {{ newEntry.commits.length }} commit{{ newEntry.commits.length > 1 ? 's' : '' }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import Vue from 'vue';
import parse from 'parse-diff';
import showdown from 'showdown';
import {ChangelogEntry, Commit} from '@/types';
import {decodeUtf8String, samplePatch, utf8Headers} from '@/helper/content';
import mimemessage from 'mimemessage';

enum Step {
  AskForDiff = 1,
  BuildChangelog = 2,
}

const newEntryFactory = () => ({
  text: '' as string,
  commits: [] as Commit[],
})

const converter = new showdown.Converter({
  extensions: [
    {
      type: 'lang',
      regex: /\b([a-f0-9]{7})\b/g,
      replace: '<span class="hash">$1</span>'
    },
    {
      type: 'output',
      filter: (text: string) => {
        // Detect "<code class="diff language-diff">" blocks
        // Replace lines starting with -, and ones starting with +
        const el = document.createElement('div');
        el.innerHTML = text;

        for (const code of el.querySelectorAll('.diff')) {
          code.innerHTML = code.innerHTML
            .replace(/(-.+)/g, '<span class="diff-deleted">$1</span>')
            .replace(/(\+.+)/g, '<span class="diff-added">$1</span>');
        }

        return el.innerHTML;
      }
    }
  ]
});

export default Vue.extend({
  name: 'ChangelogGenerator',
  data: () => ({
    step: 1,

    diff: '',
    commits: [] as Array<Commit>,
    filesChanged: 0,
    additions: 0,
    deletions: 0,
    entries: [] as Array<ChangelogEntry>,
    newEntry: newEntryFactory(),
  }),
  methods: {
    parseDiff() {
      // Get a list of commits from this diff
      // Each block looks like this:
      //
      // From [hash] [date]
      // From: [username] <[user email]>
      // Date: [date]
      // Subject: [PATCH [index]/[max]] [commit name]
      // [commit description]
      //
      // ---
      // [full diff]

      // UTF-8 encoding headers: remove them
      let diff = this.diff;
      diff = diff.split(utf8Headers).join('');

      try {
        const rows = diff.split("\n");
        const textCommits = [];

        // Group diff into blocks
        let lastCommitRows = [];
        for (const row of rows) {
          // From f01721654e9b9d7c54a51a8820006d10c69b8c51 Mon Sep 17 00:00:00 2001
          const firstRowMatch = /^From ([a-f0-9]+)/.exec(row);
          if (firstRowMatch) {
            // That's a new block
            if (lastCommitRows.length) {
              textCommits.push(lastCommitRows);
            }
            lastCommitRows = [];
          }
          lastCommitRows.push(row);
        }
        if (lastCommitRows.length) {
          textCommits.push(lastCommitRows);
        }

        // Parse each block
        this.commits = textCommits.map((rows: string[]): Commit => {
          // First row is commit hash
          const commitHashRow = rows.shift() as string;
          const commitHashMatch = /^From ([a-f0-9]+)/.exec(commitHashRow);
          if (!commitHashMatch) {
            throw new Error(`Could not parse first row "${commitHashRow}"`);
          }
          const commitHash = commitHashMatch[1];

          // Parse block as a mime message
          const mimeBlock = mimemessage.parse(rows.join('\r\n'));

          // From: Git author
          const gitAuthor = mimeBlock.header('From');
          const commitUserMatch = /^(.+) <([\S]+)>/.exec(gitAuthor);
          if (!commitUserMatch) {
            throw new Error(`Could not parse git author row "${gitAuthor}"`);
          }
          const commitUser = decodeUtf8String(commitUserMatch[1]);
          const commitUserEmail = commitUserMatch[2];

          // Subject: git commit message
          const gitCommitMessage = mimeBlock.header('Subject');
          const messageMatch = /^\[PATCH(?: \d+\/\d+)?\] (.+)$/.exec(gitCommitMessage);
          if (!messageMatch) {
            throw new Error(`Could not parse third row "${gitCommitMessage}"`);
          }
          let message = decodeUtf8String(messageMatch[1]);

          const content = mimeBlock.body;
          // Body will either contain commit message's 2nd+ rows AND diff, or just the diff.
          const parts = content.split('\r\n---\r\n');
          let commitDiff = parts.pop(),
            messageMore = parts.pop() || '';

          // Remove empty lines
          messageMore = messageMore.split("\r\n\r\n").join('\n');

          // Parse commit diff: lines added / removed
          const diff = parse(commitDiff);
          const files = diff.length;
          let additions = 0,
            deletions = 0;
          for (const file of diff) {
            additions += file.additions;
            deletions += file.deletions;
          }

          return {
            message,
            messageMore,
            hash: commitHash.substr(0, 7),
            username: commitUser,
            email: commitUserEmail,
            files,
            additions,
            deletions,
            added: false,
          };
        });
      } catch (e) {
        console.error(e);
        alert(
          'Could not parse specified patch. If you think this is a mistake, please open an issue: https://github.com/MesaVolt/git-changelog-generator/issues'
          + '\n' + e
        );
        this.commits = [];
        return;
      }

      this.filesChanged = this.commits.reduce((a, commit) => a + commit.files, 0);
      this.additions = this.commits.reduce((a, commit) => a + commit.additions, 0);
      this.deletions = this.commits.reduce((a, commit) => a + commit.deletions, 0);

      this.step = Step.BuildChangelog;
    },
    toggle(commit: Commit) {
      const commits = this.newEntry.commits;

      if (commits.includes(commit)) {
        commits.splice(this.newEntry.commits.indexOf(commit), 1);

        if (commits.length === 0) {
          this.newEntry.text = '';
        }
      } else {
        commits.push(commit);
        if (!this.newEntry.text.length) {
          this.newEntry.text = commit.message;
        }
      }

      if (commits.length > 0) {
        let delay = 0;
        if (commits.length === 1) {
          // Just added it, wait for transition to finish
          delay = 300;
        }
        const newEntryTextInput = this.$refs.newEntryText as HTMLInputElement;
        setTimeout(() => newEntryTextInput.focus(), delay);
      }
    },
    addEntry(e: Event) {
      e.preventDefault();

      this.entries.push({
        text: this.newEntry.text,
        hashes: this.newEntry.commits.map(c => c.hash),
      });
      for (const commit of this.newEntry.commits) {
        commit.added = true;
      }
      this.newEntry = newEntryFactory();
    },
    copy() {
      const input = this.$refs.changelogInput as HTMLTextAreaElement;

      input.select();
      document.execCommand("copy");
    },
  },
  computed: {
    Step: () => Step,

    changelogAsMarkdown(): string {
      const rows = [
        '**Changelog**'
      ];

      if (this.entries.length === 0) {
        rows.push(
         ` - *This changelog is empty.*`
        );
      }
      else {
        rows.push(...this.entries.map(entry => {
          let text = ` - ${entry.text}`;

          if (entry.hashes.length) {
            text += ` ${entry.hashes.join(' ')}`;
          }

          return text;
        }));
      }

      rows.push(
        '',
        '**Stats**',
        '```diff',
        `${this.commits.length} commits`,
        `${this.filesChanged} files changed`,
        `+${this.additions} additions`,
        `-${this.deletions} deletions`,
        '```',
        '',
        '**Contributors**:'
      );

      const contributors = [] as Array<{name: string, email: string, commits: number}>;
      for (const commit of this.commits) {
        let contributor = contributors.find(c => c.email === commit.email);
        if (!contributor) {
          contributor = {
            name: commit.username,
            email: commit.email,
            commits: 0,
          };
          contributors.push(contributor);
        }
        contributor.commits++;
      }
      contributors.sort((c1, c2) => c2.commits - c1.commits);

      rows.push(
        ...contributors.map(contributor =>
          ` - ${contributor.name} <${contributor.email}> - ${contributor.commits} commit${contributor.commits != 1 ? 's' : ''}`
        )
      );

      return rows.join('\n');
    },
    changelogAsHTML(): string {
      const markdown = this.changelogAsMarkdown as string;
      return converter.makeHtml(markdown);
    },
    samplePatch: () => samplePatch,
  }
});
</script>

<style scoped lang="scss">
.app {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
}
header {
  background: var(--color-primary);
  box-shadow: 0 1px 1px rgba(0,0,0,0.1);
  color: #fff;
  padding: 13px 16px;
  height: 50px;
  z-index: 1;

  h1 {
    font-size: 18px;
    font-weight: 600;
    margin: 0;
  }
}

h2 {
  margin-top: 10px;
  margin-left: 12px;
  margin-bottom: 10px;
  font-weight: 600;
  font-size: 22px;
}

button {
  border: 0;
  border-radius: 4px;
  padding: 7px 12px;
  box-shadow: 0 0 0 1px rgba(43,45,80,.1),0 2px 5px 0 rgba(43,45,80,.08),0 1px 1.5px 0 rgba(0,0,0,.07),0 1px 2px 0 rgba(0,0,0,.08);
  color: #fff;
  font-weight: 600;
  text-align: center;
  transition: all .08s ease-in;
  background: var(--color-primary);

  &:hover {
    filter: brightness(1.1);
    box-shadow: 0 0 0 1px rgba(43,45,80,.1),0 2px 5px 0 rgba(43,45,80,.1),0 3px 9px 0 rgba(43,45,80,.08),0 1px 1.5px 0 rgba(0,0,0,.08),0 1px 2px 0 rgba(0,0,0,.08);
  }
}

input {
  color: inherit;
}
input[type="text"] {
  border-radius: 4px;
  border: 0;
  padding: 3px 7px 4px;
  box-shadow: 0 0 0 1px rgba(43,45,80,.16),0 0 0 1px rgba(6,122,184,0),0 0 0 2px rgba(6,122,184,0),0 1px 1px rgba(0,0,0,.08);
}
textarea {
  height: 100%;
  resize: vertical;
  font-family: inherit;
  font-size: 12px;
  border: 0;
  flex-grow: 1;
  width: 40%;
  padding: 10px;
}

// utils
.text-muted {
  opacity: 0.6;
}
.white-space-pre {
  white-space: pre;
}

.content {
  height: calc(100vh - 50px);
  display: flex;
  padding: 20px;
}

.floating-action {
  position: absolute;
  bottom: 30px;
  opacity: 0;
  transform: translateY(70px) scale(0.95);
  transition-duration: 300ms;
  transition-timing-function: cubic-bezier(0.0, 0.0, 0.2, 1);
  border-radius: 4px;

  box-shadow: 0 1px 2px rgba(0,0,0,0.07),
    0 2px 4px rgba(0,0,0,0.07),
    0 4px 8px rgba(0,0,0,0.07),
    0 8px 16px rgba(0,0,0,0.07),
    0 16px 32px rgba(0,0,0,0.07),
    0 32px 64px rgba(0,0,0,0.07);

  &.visible {
    opacity: 1;
    transform: translateY(0) scale(1);
    transition-timing-function: cubic-bezier(0.4, 0.0, 1, 1);
  }
}

.card {
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 4px;
  box-shadow:
    0 0 0 1px rgba(0,0,0,0.1),
    0 4px 8px rgba(0,0,0,0.07),
    0 8px 16px rgba(0,0,0,0.07),
    0 16px 32px rgba(0,0,0,0.07),
    0 32px 64px rgba(0,0,0,0.07);

  .card-header,
  .card-footer {
    background: #f8f9fa;
    border-style: solid;
    border-color: rgba(#000, 0.1);
    border-width: 0;
    padding: 10px 12px;
  }
  .card-header {
    border-bottom-width: 1px;
    border-radius: 4px 4px 0 0;

    .card-title {
      margin: 0;
      font-size: 0.9em;
      font-weight: 500;
    }
  }
  .card-body {
    border-radius: 0 0 4px 4px;
    flex-grow: 1;

    &:not(:last-child) {
      border-radius: 0;
    }
  }
  .card-body + .card-body {
    border-top: 1px solid rgba(#000, 0.1);
  }
  .card-footer {
    border-top-width: 1px;
    border-radius: 0 0 4px 4px;
  }
}


.ask-for-diff {
  flex-grow: 1;
  display: flex;

  .card {
    width: 100%;

    .card-body {
      position: relative;

      textarea {
        border-radius: 0 0 4px 4px;
      }
    }
  }

  .help {
    position: absolute;
    top: 40%;
    left: 0;
    width: 100%;
    text-align: center;
    pointer-events: none;
  }
  .placeholder {
    position: absolute;
    top: 10px;
    left: 10px;
    opacity: 0.5;
    pointer-events: none;
    background: linear-gradient(#333, #eee);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    white-space: pre;
    font-size: 12px;
  }
  textarea {
    width: 100%;
    height: 100%;
  }
  .floating-action {
    left: 42vw;
    width: 16vw;

    button {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      padding-top: 12px;
      padding-bottom: 12px;
      box-shadow: none;
      font-size: 20px;

      svg {
        fill: #fff;
        margin-right: 12px;
      }
    }
  }
}

.changelog-builder {
  display: flex;
  width: 100%;

  .commits {
    width: 60%;

    .card-body {
      overflow: auto;
    }
  }
  .commit {
    display: flex;
    align-items: center;
    padding: 5px 8px;
    font-size: 12px;
    cursor: default;
    border-bottom: 1px solid rgba(0, 0, 0, .1);

    input[type="checkbox"] {
      margin-right: 12px;
    }
    &:hover {
      background: rgba(0, 0, 0, 0.03);
    }
    &:last-child {
      border-bottom: 0;
    }
    .commit-title {
      margin: 0;
      font-weight: 500;
    }
    .commit-more {
      margin: 0;
      line-height: 1em;
    }
    .meta {
      margin-left: auto;
      text-align: right;
      font-size: 0.9em;
      opacity: 0.6;
    }
    &.added {
      text-decoration: line-through;
      opacity: 0.5;
      pointer-events: none;
    }

    .additions {
      color: #22863a;
    }
    .deletions {
      color: #e5534b;
    }
  }

  .sidebar {
    display: flex;
    flex-direction: column;
    margin-left: 15px;
    width: 40%;
  }

  .changelog-preview {
    display: flex;
    margin-bottom: 15px;
    height: 60%;

    textarea {
      width: 100%;
    }

    .card-body {
      overflow-y: auto;
    }
    .changelog-as-html {
      padding: 10px;
    }
  }

  .changelog-markdown {
    display: flex;
    flex-grow: 1;

    .card-body {
      display: flex;
    }

    .card-footer button {
      display: block;
      margin-left: auto;
    }
  }

  .new-changelog-item {
    width: 60vw;
    left: 20vw;
    display: flex;

    input[type="text"] {
      flex-grow: 1;
      padding: 8px 16px;
      box-shadow: none;
      font-size: 18px;
      border-top-right-radius: 0;
      border-bottom-right-radius: 0;
    }

    button {
      border-top-left-radius: 0;
      border-bottom-left-radius: 0;
    }
  }
}
</style>
