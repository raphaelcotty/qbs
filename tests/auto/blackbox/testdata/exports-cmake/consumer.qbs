import qbs.FileInfo

Project {
    CppApplication {
        Depends { name: "Bar" }
        consoleApplication: true
        files: "main.cpp"

        //moduleProviders.cmake.cmakePrefixPath: FileInfo.joinPaths(qbs.installRoot,
        //                                                          qbs.installPrefix, "lib", "cmake")
        moduleProviders.cmake.cmakePrefixPath: "/home/raph/src/qbs/tests/auto/blackbox/testdata/build-exports-cmake-Desktop_Qt_5_15_8_GCC_64bit-Debug/Debug_Desktop__62f1ccf96e8d62a9/install-root/usr/local/lib/cmake"
        moduleProviders.cmake.packages: ({ Bar: { name: "Bar" }})
        qbsModuleProviders: ["cmake"]
    }
}

