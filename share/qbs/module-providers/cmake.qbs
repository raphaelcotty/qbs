import "setup-cmake.js" as SetupCMake
import qbs.File
import qbs.Probes

ModuleProvider {
    property string cmakeToolChainFile: ""
    property stringList cmakePrefixPath: []
    property string executableFilePath: cmakeProbe.filePath
    property bool useBoostStaticLibs: false

    Probes.BinaryProbe {
        id: cmakeProbe
        names: "cmake"
    }

    property var packages: ({
                                Boost: {
                                    name: "Boost",
                                    components: ["atomic", "chrono", "container", "context",
                                        "contract", "coroutine", "date_time", "exception", "fiber",
                                        "filesystem", "graph", "graph-parallel", "headers",
                                        "iostreams", "locale", "log", "math", "mpi",
                                        "program-options", "random", "regex", "serialization",
                                        "signals", "stackstrace", "system", "test", "thread",
                                        "timer", "type-erasure", "wave"]},
                                Poco: {
                                    name: "Poco",
                                    components: ["Crypto", "Data", "DataMySQL", "DataODBC",
                                        "DataSQLite", "Encodings", "Foundation",
                                        "JSON", "MongoDB", "Net", "NetSSL",
                                        "Redis", "Util", "XML", "Zip"]}
                            })

    relativeSearchPaths: {
        if (!executableFilePath) {
                console.warn("Could not find any cmake executables in PATH. Either make sure a "
                             + "cmake executable is present in PATH or set the "
                             + "moduleProviders.cmake.executableFilePath property to point a cmake "
                             + "executable.");
            return [];
        }
        if (!File.exists(executableFilePath)) {
            console.warn("The cmake executable '" + executableFilePath + "' does not exist.");
            return [];
        }

        var extraVariables = [];
        if (useBoostStaticLibs)
            extraVariables.push("-DBoost_USE_STATIC_LIBS=ON");
        if (cmakePrefixPath)
            extraVariables.push("-DCMAKE_PREFIX_PATH=" + cmakePrefixPath.join(':'));

        return SetupCMake.doSetup(executableFilePath, packages, outputBaseDir, path, qbs,
                                  cmakeToolChainFile, extraVariables);
    }
}

