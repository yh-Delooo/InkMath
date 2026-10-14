// Keep image processing inside the directory provided by PluginManager.
// Chauvet 3.29.43+ does not grant plugins access to the host's shared cache.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const editor = path.join(root, 'node_modules/@react-native-community/image-editor/android/src/main/java/com/reactnativecommunity/imageeditor/ImageEditorModuleImpl.kt');
let source = fs.readFileSync(editor, 'utf8').replace(/\r\n/g, '\n');
if (!source.includes('// Supernote private output directory')) {
  const replacements = [
    [
      /    private fun cleanTask\(\) \{[\s\S]*?\n    \}\n\n    private fun cleanDirectory/,
      '    private fun cleanTask() {\n        // Supernote owns no files in the shared host cache.\n    }\n\n    private fun cleanDirectory',
    ],
    [
      'val tempFile = createTempFile(reactContext, mimeType)',
      'val tempFile = createTempFile(options.getString("outputDirectory"), mimeType)',
    ],
    [
      /        private fun createTempFile\(context: Context, mimeType: String\?\): File \{[\s\S]*?\n        \}\n/,
      `        private fun createTempFile(outputDirectory: String?, mimeType: String?): File {
            // Supernote private output directory; never fall back to host cache.
            if (outputDirectory.isNullOrEmpty()) {
                throw IOException("Plugin output directory is required")
            }
            val directory = File(outputDirectory)
            if (!directory.isAbsolute || (!directory.isDirectory && !directory.mkdirs())) {
                throw IOException("Cannot access plugin output directory")
            }
            return File(directory, "cropped" + getFileExtensionForType(mimeType))
        }
`,
    ],
  ];
  for (const [pattern, replacement] of replacements) {
    const next = source.replace(pattern, replacement);
    if (next === source) throw new Error('Image editor source changed; review private-cache patch');
    source = next;
  }
  fs.writeFileSync(editor, source);
}
const viewShot = path.join(root, 'node_modules/react-native-view-shot/android/src/main/java/fr/greweb/reactnativeviewshot/RNViewShotModule.java');
source = fs.readFileSync(viewShot, 'utf8');
const cleanup = 'new CleanTask(getReactApplicationContext()).executeOnExecutor(AsyncTask.THREAD_POOL_EXECUTOR);';
const replacement = '// Supernote: capture uses base64; no host-cache files to clean.';
if (!source.includes(replacement)) {
  if (!source.includes(cleanup)) throw new Error('View-shot source changed; review private-cache patch');
  fs.writeFileSync(viewShot, source.replace(cleanup, replacement));
}
console.log('Supernote private-cache patches applied');
