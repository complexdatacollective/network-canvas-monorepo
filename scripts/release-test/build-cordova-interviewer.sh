#!/usr/bin/env bash
# Builds the last Cordova release of Interviewer Classic (6.5.4, from the
# complexdatacollective/Interviewer repository) for the iOS simulator and as an
# Android debug APK: the "before" side of
# scripts/release-test/interviewer-classic-cordova-upgrade.mjs.
#
# Usage: scripts/release-test/build-cordova-interviewer.sh <work-dir> [ios|android|all]
#
# Prints the built artifacts' paths at the end. Rerunning reuses the clone and
# its node_modules. The storage-related configuration (cordova-sqlite-storage,
# cordova-plugin-file, iosPersistentFileLocation, the app identifiers) is built
# exactly as tagged; the only changes are toolchain compatibility fixes, each
# marked below.
#
# Needs: fnm (installs Node 14.21.3 for the webpack build and Node >= 16.7 for
# the Cordova CLI), Xcode for iOS, and for Android the SDK (ANDROID_HOME,
# default the Homebrew android-commandlinetools), JDK 17 (JAVA_HOME, default
# Homebrew openjdk@17) and any Gradle on PATH or in ~/.gradle/wrapper/dists.
set -euo pipefail

WORK="${1:?usage: build-cordova-interviewer.sh <work-dir> [ios|android|all]}"
TARGET="${2:-all}"
TAG=v6.5.4
mkdir -p "$WORK"
WORK="$(cd "$WORK" && pwd)"
SRC="$WORK/interviewer-${TAG#v}"

# fnm finds its Node versions under HOME, which the npm and Cordova steps
# below override; pin the real location first.
export FNM_DIR="${FNM_DIR:-$HOME/.local/share/fnm}"
node24() { fnm exec --using=24 -- "$@"; }
fnm install 14.21.3 >/dev/null
fnm install 24 >/dev/null

# The lockfile pins git+ssh GitHub dependencies; a throwaway HOME whose
# .gitconfig rewrites them to https lets npm fetch them without SSH keys (npm
# drops GIT_CONFIG_* variables). Used for npm and Cordova only.
FAKEHOME="$WORK/home"
mkdir -p "$FAKEHOME" "$WORK/tools"
cat > "$FAKEHOME/.gitconfig" <<'EOF'
[url "https://github.com/"]
	insteadOf = ssh://git@github.com/
	insteadOf = git@github.com:
	insteadOf = git+ssh://git@github.com/
EOF

# The project has no local Cordova CLI; cordova@12 needs Node >= 16.7.
CORDOVA="$WORK/tools/node_modules/.bin/cordova"
[ -x "$CORDOVA" ] || (cd "$WORK/tools" && node24 npm i cordova@12)

[ -d "$SRC" ] || git clone --branch "$TAG" --depth 1 \
  https://github.com/complexdatacollective/Interviewer.git "$SRC"
cd "$SRC"
git submodule update --init --recursive

[ -d node_modules ] || env HOME="$FAKEHOME" ELECTRON_SKIP_BINARY_DOWNLOAD=1 \
  fnm exec --using=14.21.3 -- npx -y npm@8.19.4 ci --cache "$WORK/npm-cache"

# The before_prepare hook raises config.xml's build numbers on every prepare;
# reset it so each build carries the tagged number plus one, and compile
# (not build) so Gradle does not prepare a second time.
reset_config() { git -C "$SRC" checkout -- config.xml; }
web_build() { env HOME="$FAKEHOME" NC_TARGET_PLATFORM="$1" fnm exec --using=14.21.3 -- node scripts/build.js; }
prepare() { reset_config; env HOME="$FAKEHOME" fnm exec --using=24 -- "$CORDOVA" prepare "$1"; }

rm -rf platforms plugins

if [ "$TARGET" = ios ] || [ "$TARGET" = all ]; then
  web_build ios
  prepare ios
  # Compatibility: current Xcode rejects this private header (netinet/in.h
  # already includes it).
  sed -i '' '/#import <netinet6\/in6.h>/d' \
    "platforms/ios/Network Canvas Interviewer/Plugins/cordova-plugin-network-information/CDVReachability.m"
  # Compatibility: current SDKs' minimum deployment target; simulator only.
  (cd platforms/ios && xcodebuild -project "Network Canvas Interviewer.xcodeproj" \
    -scheme "Network Canvas Interviewer" -configuration Debug -sdk iphonesimulator \
    -destination 'generic/platform=iOS Simulator' -derivedDataPath "$WORK/ios-build" \
    CODE_SIGNING_ALLOWED=NO IPHONEOS_DEPLOYMENT_TARGET=15.0 ARCHS=arm64 ONLY_ACTIVE_ARCH=YES \
    build >"$WORK/xcodebuild-ios.log")
  rm -rf "$WORK/cordova-ios.app"
  cp -R "$WORK/ios-build/Build/Products/Debug-iphonesimulator/Network Canvas Interviewer.app" \
    "$WORK/cordova-ios.app"
  echo "iOS app: $WORK/cordova-ios.app"
fi

if [ "$TARGET" = android ] || [ "$TARGET" = all ]; then
  web_build android
  prepare android
  export ANDROID_HOME="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
  export ANDROID_SDK_ROOT="$ANDROID_HOME"
  export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home}"
  export GRADLE_USER_HOME="$WORK/gradle-home"
  [ -d "$ANDROID_HOME/platforms/android-35" ] ||
    yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --install "platforms;android-35"
  # Cordova needs some Gradle on PATH only to generate its wrapper.
  GRADLE_BIN="$(command -v gradle >/dev/null && dirname "$(command -v gradle)" ||
    ls -d "$HOME"/.gradle/wrapper/dists/gradle-*/*/gradle-*/bin 2>/dev/null | tail -1)"
  # Compatibility: cordova-android 13 asks for build-tools 34; use the 35
  # that current SDK installs carry.
  env PATH="$GRADLE_BIN:$PATH" fnm exec --using=24 -- "$CORDOVA" compile android --debug -- \
    --gradleArg=-PcdvBuildToolsVersion=35.0.0
  cp platforms/android/app/build/outputs/apk/debug/app-debug.apk "$WORK/cordova.apk"
  echo "Android APK: $WORK/cordova.apk"
fi
reset_config
