const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const destRoot = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, "www");
const www = path.join(destRoot, "www");

const files = [
  "training-tracker.css",
  "training-tracker.js",
  "wearable.js",
  "exercise-catalog.js",
  "cloud.js",
  "supabase-config.js",
  "apple-touch-icon.png",
  "icon-192.png",
  "icon-512.png",
  "icon-192.svg",
  "icon-512.svg",
  "manifest.webmanifest",
  "privacypolicy.html",
];

function copyDir(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dest);
    else fs.copyFileSync(src, dest);
  }
}

fs.mkdirSync(www, { recursive: true });
fs.mkdirSync(path.join(www, "data"), { recursive: true });

for (const file of files) {
  const from = path.join(root, file);
  if (fs.existsSync(from)) fs.copyFileSync(from, path.join(www, file));
}

const workouts = path.join(root, "data", "workouts.json");
if (fs.existsSync(workouts)) {
  fs.copyFileSync(workouts, path.join(www, "data", "workouts.json"));
}

let html = fs.readFileSync(path.join(root, "training-tracker.html"), "utf8");
html = html.replace(
  /<script>\s*const APP_VERSION[\s\S]*?<\/script>/,
  `<script>
      const APP_VERSION = "v145-android";
    </script>`
);
fs.writeFileSync(path.join(www, "index.html"), html);

const nativeDir = path.join(root, "native", "android");
if (process.argv[2] && fs.existsSync(nativeDir)) {
  const javaDir = path.join(destRoot, "android", "app", "src", "main", "java", "com", "trainy", "app");
  fs.mkdirSync(javaDir, { recursive: true });
  for (const file of fs.readdirSync(nativeDir)) {
    if (file.endsWith(".kt") || file.endsWith(".java")) {
      fs.copyFileSync(path.join(nativeDir, file), path.join(javaDir, file));
    }
  }
  const manifest = path.join(nativeDir, "AndroidManifest.xml");
  if (fs.existsSync(manifest)) {
    fs.copyFileSync(manifest, path.join(destRoot, "android", "app", "src", "main", "AndroidManifest.xml"));
  }
  copyDir(path.join(nativeDir, "res"), path.join(destRoot, "android", "app", "src", "main", "res"));
}

console.log(`synced web assets -> ${www}`);
