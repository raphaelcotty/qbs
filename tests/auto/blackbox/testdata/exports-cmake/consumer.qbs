import qbs.FileInfo

Project {
    CppApplication {
        Depends { name: "Bar" }
        consoleApplication: true
        files: "main.cpp"

        moduleProviders.cmake.cmakePrefixPath: {
            console.warn("installRoot :"+qbs.installRoot)
            console.warn("installPrefix :"+qbs.installPrefix)
            return FileInfo.joinPaths(qbs.installRoot,
                                      qbs.installPrefix, "lib", "cmake")
        }
        moduleProviders.cmake.packages: ({ Bar: { name: "Bar" }})
        qbsModuleProviders: ["cmake"]
    }
}

