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

        <div class="card with-footer changelog">
          <div class="card-header">
            <h2 class="card-title">Changelog</h2>
          </div>

          <textarea readonly ref="changelogInput" v-model="changelog"></textarea>

          <div class="card-footer">
            <button type="button" @click="copy">Copy to clipboard</button>
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
import libmime from 'libmime';
import {ChangelogEntry, Commit} from '@/types';
import {samplePatch} from '@/helper/content';

enum Step {
  AskForDiff = 1,
  BuildChangelog = 2,
}

const newEntryFactory = () => ({
  text: '' as string,
  commits: [] as Commit[],
})

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

      const rows = this.diff.split("\n");
      const textCommits = [];

      // Group diff into blocks
      let lastCommitRows = [];
      for (const row of rows) {
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
        const commitHashMatch = /^From ([a-f0-9]+)/.exec(rows[0]);
        if (!commitHashMatch) {
          throw new Error(`Could not parse first row "${rows[0]}"`);
        }
        const commitHash = commitHashMatch[1];

        // Second row is git user name & email
        const commitUserMatch = /^From: (.+) <([\S]+)>/.exec(rows[1]);
        if (!commitUserMatch) {
          throw new Error(`Could not parse second row "${rows[1]}"`);
        }
        let commitUser = commitUserMatch[1];
        if (commitUser.indexOf('=?UTF-8?') === 0) {
          commitUser = libmime.decodeWords(commitUser);
        }
        let commitUserEmail = commitUserMatch[2];

        // Fourth row is main commit message
        const messageMatch = /^Subject: \[PATCH(?: \d+\/\d+)?\] (.+)$/.exec(rows[3]);
        if (!messageMatch) {
          throw new Error(`Could not parse fourth row "${rows[3]}"`);
        }
        let message = messageMatch[1];

        // All the following lines not beginning with --- and not empty are additional commit rows
        let messageMore = [];
        let lastCommitMessageRow = 0;
        for (let i = 4; i<rows.length; i++) {
          if (rows[i].indexOf('---') === 0) {
            lastCommitMessageRow = i+1;
            break;
          }
          if (!rows[i].length) {
            continue;
          }
          // Treat first "messageMore" row as a continuation of commit message if it starts with a space
          if (messageMore.length === 0 && rows[i].indexOf(' ') === 0) {
            message += rows[i];
            continue;
          }

          messageMore.push(rows[i]);
        }

        // Parse the rest: lines added / removed
        const diff = parse(rows.slice(lastCommitMessageRow).join("\n"));
        const files = diff.length;
        let additions = 0,
            deletions = 0;
        for (const file of diff) {
          additions += file.additions;
          deletions += file.deletions;
        }

        return {
          message,
          messageMore: messageMore.join("\n"),
          hash: commitHash.substr(0, 7),
          username: commitUser,
          email: commitUserEmail,
          files,
          additions,
          deletions,
          added: false,
        };
      });

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

    changelog(): string {
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
  }
  .card-footer {
    border-top-width: 1px;
    border-radius: 0 0 4px 4px;
  }
  &.with-footer {
    .card-body {
      border-radius: 0;
    }
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

  .changelog {
    display: flex;
    margin-left: 15px;
    width: 40%;

    textarea {
      width: 100%;
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
