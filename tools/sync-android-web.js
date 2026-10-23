const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const destRoot = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, "www");
const www = path.join(destRoot, "www");

const files = [
  "training-tracker.css",
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
fs.rmSync(path.join(www, "js"), { recursive: true, force: true });
copyDir(path.join(root, "js"), path.join(www, "js"));

const workouts = path.join(root, "data", "workouts.json");
if (fs.existsSync(workouts)) {
  fs.copyFileSync(workouts, path.join(www, "data", "workouts.json"));
}

let html = fs.readFileSync(path.join(root, "training-tracker.html"), "utf8");
html = html.replace(/const APP_VERSION = "(v\d+)";/, 'const APP_VERSION = "$1-android";');
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

  // Номер в «О приложении» должен совпадать с версией сайта, иначе не понять, что установлено.
  const version = html.match(/const APP_VERSION = "v(\d+)/)?.[1];
  const gradle = path.join(destRoot, "android", "app", "build.gradle");
  if (version && fs.existsSync(gradle)) {
    const source = fs.readFileSync(gradle, "utf8")
      .replace(/versionCode \d+/, `versionCode ${version}`)
      .replace(/versionName "[^"]*"/, `versionName "${version}"`);
    fs.writeFileSync(gradle, source);
  }
}

console.log(`synced web assets -> ${www}`);
