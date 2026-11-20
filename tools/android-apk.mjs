// npm run android:apk -> android/app/build/outputs/apk/debug/app-debug.apk
// npm run android:aab -> android/app/build/outputs/bundle/release/app-release.aab (for the Play Store, signed
// with the key named in android/keystore.properties)
// Capacitor 8's Gradle needs Java 21; Android Studio ships a newer one. This finds a JDK 21
// (JAVA_HOME if it is 21, else the usual install folders) and runs the Gradle build with it.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const win = process.platform === 'win32';
const javaOf = home => join(home, 'bin', win ? 'java.exe' : 'java');
const javaVersionText = home => { const r = spawnSync(javaOf(home), ['-version'], { encoding: 'utf8' }); return (r.stderr || '') + (r.stdout || ''); };

const candidates = [];
if (process.env.JAVA_HOME) candidates.push(process.env.JAVA_HOME);
const roots = win ? ['C:/Program Files/Eclipse Adoptium', 'C:/Program Files/Java', 'C:/Program Files/Microsoft']
  : ['/usr/lib/jvm', '/Library/Java/JavaVirtualMachines'];
for (const r of roots) if (existsSync(r)) for (const d of readdirSync(r)) {
  const home = existsSync(join(r, d, 'Contents', 'Home')) ? join(r, d, 'Contents', 'Home') : join(r, d);
  candidates.push(home);
}
const jdk = candidates.find(h => existsSync(javaOf(h)) && /version "21\./.test(javaVersionText(h)));
if (!jdk) {
  console.error('No Java 21 found. Install one (winget install EclipseAdoptium.Temurin.21.JDK) or set JAVA_HOME to it.');
  process.exit(1);
}
console.log('Java 21: ' + jdk);
const dir = join(process.cwd(), 'android'), gradlew = join(dir, win ? 'gradlew.bat' : 'gradlew');
const task = process.argv[2] === 'aab' ? 'bundleRelease' : 'assembleDebug';
if (task === 'bundleRelease' && !existsSync(join(dir, 'keystore.properties'))) {
  console.error('android/keystore.properties is missing: the Play Store bundle must be signed with the upload key.');
  process.exit(1);
}
const r = spawnSync(win ? `"${gradlew}"` : gradlew, [task], { cwd: dir, stdio: 'inherit', shell: win, env: { ...process.env, JAVA_HOME: jdk } });
if (r.status === 0) console.log(task === 'bundleRelease' ? 'AAB: android/app/build/outputs/bundle/release/app-release.aab' : 'APK: android/app/build/outputs/apk/debug/app-debug.apk');
process.exit(r.status ?? 1);
