import qbs 1.0

Project {
    // no minimum versions are specified so the profile defaults will be used
    CppApplication {
        type: "application"
        Depends { name: "Qt.core" }
        name: "unspecified"
        files: "main.cpp"

        Properties {
            condition: qbs.targetPlatform.indexOf("darwin") !== -1
            cpp.frameworks: "Foundation"
        }
    }

    // no minimum versions are specified, and explicitly set to undefined in
    // case the profile has set it
    CppApplication {
        type: "application"
        Depends { name: "Qt.core" }
        name: "unspecified-forced"
        files: "main.cpp"
        cpp.minimumWindowsVersion: undefined
        cpp.minimumMacVersion: undefined
        cpp.minimumIosVersion: undefined
        cpp.minimumAndroidVersion: undefined

        Properties {
            condition: qbs.targetPlatform.indexOf("darwin") !== -1
            cpp.frameworks: "Foundation"
        }
    }

    // a specific version of the operating systems is specified
    // when the application is run its output should confirm
    // that the given values took effect
    CppApplication {
        type: "application"
        Depends { name: "Qt.core" }
        condition: qbs.targetOS === "windows" || qbs.targetOS === "mac"
        name: "specific"
        files: "main.cpp"

        Properties {
            condition: qbs.targetOS === "windows"
            cpp.minimumWindowsVersion: "6.0"
        }

        Properties {
            condition: qbs.targetOS === "mac"
            cpp.frameworks: "Foundation"
            cpp.minimumMacVersion: "10.6"
        }
    }

    // non-existent versions of Windows should print a QBS warning
    // (but will still compile and link since we avoid passing a
    // bad value to the linker)
    CppApplication {
        type: "application"
        Depends { name: "Qt.core" }
        condition: qbs.targetOS === "windows"
        name: "fakewindows"
        files: "main.cpp"
        cpp.minimumWindowsVersion: "5.3"
    }

    // just to make sure three-digit minimum versions work on OS X
    // this only affects the value of __MAC_OS_X_VERSION_MIN_REQUIRED,
    // not the actual LC_VERSION_MIN_MACOSX command which is limited to two
    CppApplication {
        type: "application"
        Depends { name: "Qt.core" }
        condition: qbs.targetOS === "mac"
        name: "macappstore"
        files: "main.cpp"
        cpp.frameworks: "Foundation"
        cpp.minimumSystemVersion: "10.6.8"
    }
}
