import type { FastifyInstance } from "fastify";

const html = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>APK Builder</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #15181d;
        background: #f6f8fb;
      }
      html,
      body {
        height: 100%;
        overflow: hidden;
      }
      body {
        margin: 0;
      }
      main {
        width: min(1180px, calc(100vw - 32px));
        height: 100dvh;
        margin: 0 auto;
        padding: 18px 0;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      h1 {
        margin: 0 0 16px;
        font-size: 27px;
        line-height: 1.1;
        flex: 0 0 auto;
      }
      .layout {
        display: grid;
        grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
        gap: 18px;
        flex: 1 1 auto;
        min-height: 0;
        min-width: 0;
      }
      section,
      .panel {
        background: white;
        border: 1px solid #d9e0ea;
        border-radius: 8px;
        padding: 16px;
        box-sizing: border-box;
        min-width: 0;
      }
      section {
        display: flex;
        flex-direction: column;
        min-height: 0;
        overflow: hidden;
      }
      label {
        display: block;
        font-size: 13px;
        font-weight: 650;
        margin: 10px 0 6px;
      }
      input,
      select,
      textarea,
      button {
        width: 100%;
        box-sizing: border-box;
        font: inherit;
      }
      input,
      select,
      textarea {
        border: 1px solid #c8d2df;
        border-radius: 6px;
        padding: 9px 10px;
        background: white;
      }
      textarea {
        min-height: 76px;
        resize: vertical;
      }
      .source-toggle {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-bottom: 8px;
      }
      .source-toggle label {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 0;
        border: 1px solid #c8d2df;
        border-radius: 6px;
        padding: 9px 10px;
        cursor: pointer;
      }
      .source-toggle input {
        width: auto;
      }
      .hidden {
        display: none;
      }
      button {
        margin-top: 12px;
        border: 0;
        border-radius: 6px;
        padding: 10px 12px;
        background: #165dff;
        color: white;
        font-weight: 700;
        cursor: pointer;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }
      th,
      td {
        border-bottom: 1px solid #e5eaf1;
        padding: 9px 8px;
        text-align: left;
        font-size: 12px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      th:nth-child(1),
      td:nth-child(1) {
        width: 34%;
      }
      th:nth-child(2),
      td:nth-child(2) {
        width: 16%;
      }
      th:nth-child(3),
      td:nth-child(3) {
        width: 24%;
      }
      th:nth-child(4),
      td:nth-child(4) {
        width: 26%;
      }
      tr {
        cursor: pointer;
      }
      h2 {
        flex: 0 0 auto;
        margin: 14px 0 10px;
        font-size: 22px;
        line-height: 1.15;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      code,
      pre {
        font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      }
      pre {
        flex: 1 1 auto;
        min-height: 0;
        height: auto;
        overflow: auto;
        padding: 12px;
        border: 1px solid #d9e0ea;
        border-radius: 8px;
        background: #101418;
        color: #e9edf2;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        font-size: 12px;
        line-height: 1.35;
        margin: 0;
      }
      .panel {
        flex: 0 0 auto;
        max-height: 190px;
        overflow: auto;
      }
      .actions {
        display: flex;
        gap: 8px;
        min-width: 0;
      }
      .actions a {
        color: #165dff;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      @media (max-width: 860px) {
        html,
        body {
          height: auto;
          overflow: auto;
        }
        main {
          width: calc(100vw - 24px);
          height: auto;
          min-height: 100dvh;
          padding: 14px 0;
        }
        .layout {
          grid-template-columns: 1fr;
          min-height: auto;
        }
        section {
          overflow: visible;
        }
        pre {
          min-height: 320px;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <h1>APK Builder</h1>
      <div class="layout">
        <section>
          <form id="build-form">
            <div class="source-toggle">
              <label>
                <input type="radio" name="sourceType" value="git" checked />
                Git
              </label>
              <label>
                <input type="radio" name="sourceType" value="zip" />
                ZIP
              </label>
            </div>
            <div id="git-fields">
              <label for="repoUrl">Git repository</label>
              <input id="repoUrl" name="repoUrl" placeholder="https://github.com/user/app.git" />
              <label for="branch">Branch</label>
              <input id="branch" name="branch" value="main" />
            </div>
            <div id="zip-fields" class="hidden">
              <label for="zipFile">ZIP file</label>
              <input id="zipFile" name="zipFile" type="file" accept=".zip,application/zip,application/x-zip-compressed" />
            </div>
            <label for="projectType">Project type</label>
            <select id="projectType" name="projectType">
              <option value="android-native">Android native</option>
              <option value="expo">Expo</option>
            </select>
            <label for="profile">Profile</label>
            <select id="profile" name="profile">
              <option value="debug">Debug</option>
              <option value="release">Release</option>
              <option value="custom">Custom</option>
            </select>
            <label for="buildSpec">Inline buildspec YAML</label>
            <textarea id="buildSpec" name="buildSpec" placeholder="Optional"></textarea>
            <button type="submit">Queue build</button>
          </form>
        </section>
        <section>
          <div class="panel">
            <table>
              <thead>
                <tr>
                  <th>Build</th>
                  <th>Status</th>
                  <th>Profile</th>
                  <th>Artifacts</th>
                </tr>
              </thead>
              <tbody id="builds"></tbody>
            </table>
          </div>
          <h2 id="selected-title">Logs</h2>
          <pre id="logs"></pre>
        </section>
      </div>
    </main>
    <script>
      const tbody = document.querySelector("#builds");
      const logs = document.querySelector("#logs");
      const gitFields = document.querySelector("#git-fields");
      const zipFields = document.querySelector("#zip-fields");
      let stream;

      function selectedSourceType() {
        return document.querySelector('input[name="sourceType"]:checked').value;
      }

      document.querySelectorAll('input[name="sourceType"]').forEach((input) => {
        input.addEventListener("change", () => {
          const isZip = selectedSourceType() === "zip";
          gitFields.classList.toggle("hidden", isZip);
          zipFields.classList.toggle("hidden", !isZip);
        });
      });

      async function loadBuilds() {
        const response = await fetch("/builds?limit=20");
        const data = await response.json();
        tbody.innerHTML = data.items
          .map((build) => {
            const artifacts = (build.artifacts || [])
              .map((artifact) => '<a href="/builds/' + build.id + '/artifacts/' + artifact.id + '/download">' + artifact.filename + "</a>")
              .join(" ");
            return '<tr data-id="' + build.id + '"><td><code>' + build.id + '</code></td><td>' + build.status + '</td><td>' + build.projectType + " / " + build.profile + '</td><td class="actions">' + artifacts + "</td></tr>";
          })
          .join("");
      }

      function streamLogs(buildId) {
        if (stream) stream.close();
        logs.textContent = "";
        document.querySelector("#selected-title").textContent = "Logs " + buildId;
        stream = new EventSource("/builds/" + buildId + "/logs/stream");
        stream.addEventListener("log", (event) => {
          const log = JSON.parse(event.data);
          logs.textContent += log.line + "\n";
          logs.scrollTop = logs.scrollHeight;
        });
        stream.addEventListener("end", () => {
          stream.close();
          loadBuilds();
        });
      }

      tbody.addEventListener("click", (event) => {
        const row = event.target.closest("tr[data-id]");
        if (row) streamLogs(row.dataset.id);
      });

      document.querySelector("#build-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const sourceType = selectedSourceType();
        let source;

        if (sourceType === "zip") {
          const file = form.get("zipFile");
          if (!file || !(file instanceof File) || file.size === 0) {
            logs.textContent = "Select a ZIP file.";
            return;
          }

          const uploadForm = new FormData();
          uploadForm.set("file", file);
          const uploadResponse = await fetch("/uploads", {
            method: "POST",
            body: uploadForm
          });

          const upload = await uploadResponse.json();
          if (!uploadResponse.ok) {
            logs.textContent = JSON.stringify(upload, null, 2);
            return;
          }

          source = {
            type: "zip",
            uploadId: upload.uploadId
          };
        } else {
          source = {
            type: "git",
            repoUrl: form.get("repoUrl"),
            branch: form.get("branch") || "main"
          };
        }

        const payload = {
          source,
          projectType: form.get("projectType"),
          profile: form.get("profile")
        };
        const buildSpec = String(form.get("buildSpec") || "").trim();
        if (buildSpec) payload.buildSpec = buildSpec;
        const response = await fetch("/builds", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const build = await response.json();
        if (!response.ok) {
          logs.textContent = JSON.stringify(build, null, 2);
          return;
        }
        await loadBuilds();
        if (build.id) streamLogs(build.id);
      });

      loadBuilds();
      setInterval(loadBuilds, 5000);
    </script>
  </body>
</html>`;

export async function uiRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", async (_request, reply) => {
    return reply.type("text/html").send(html);
  });
}
