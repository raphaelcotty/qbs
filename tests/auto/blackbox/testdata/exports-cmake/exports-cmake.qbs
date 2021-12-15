Project {
    DynamicLibrary {
        Depends { name: "cpp" }
        Depends { name: "Exporter.cmake" }
        Exporter.cmake.packageName: "Bar"
        name: "Foo"
        files: ["Foo.cpp"]
        version: "1.2.3"
        cpp.defines: ["FOO_LIB"]
        installImportLib: true
        Group {
            name: "API headers"
            files: ["Foo.h"]
            qbs.install: true
            qbs.installDir: "include"
        }
    }
}

