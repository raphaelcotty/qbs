import "cmake.qbs" as CMakeModuleProvider
import "cmake-setup.js" as CMakeSetup

import qbs.File
import qbs.FileInfo
import qbs.Process

CMakeModuleProvider {
    property path vcpkgBaseDirectory
    cmakeToolChainFile: FileInfo.joinPaths(vcpkgBaseDirectory, "scripts", "buildsystems",
                                           "vcpkg.cmake")
    relativeSearchPaths: {
        function exeSuffix(qbs) { return qbs.hostOS.contains("windows") ? ".exe" : ""; }

        function getVcpkgExecutable(qbs, vcpkgBaseDirectory) {
            var filePath = FileInfo.joinPaths(vcpkgBaseDirectory, "vcpkg" + exeSuffix(qbs));
            if (File.exists(filePath))
                return filePath;
            return undefined;
        }

        function listPackages(vcpkgExecutable) {
            var p = new Process();
            var args = ["list", "--x-json"];
            p.exec(vcpkgExecutable, args);
            //console.warn(p.readStdOut());
            //console.warn(p.readStdErr());
            if (p.exitCode() !== 0) {
                throw "the vcpkg executable '" + toNative(vcpkgExecutable) +
                        "' failed with exit code: " + p.exitCode();
            }
            var stdOut = p.readStdOut();
            return JSON.parse(stdOut);
        }

        console.debug("Running vcpkg provider.")

        var outputDir = FileInfo.joinPaths(outputBaseDir, "modules");
        File.makePath(outputDir);

        var vcpkgExecutable = getVcpkgExecutable(qbs, vcpkgBaseDirectory);
        if (!vcpkgExecutable) {
            console.warn("Failed to find the vcpkg executable");
            return;
        }

        var moduleMapping = {
            "boost": "Boost"
        }

        var vcpkgs = listPackages(vcpkgExecutable);
        //var keys = Object.keys(packages);
        //console.warn(keys);

        for (var vcpkgName in vcpkgs) {
            var parts = vcpkgName.split(':');
            if (parts.length != 2)
                continue;
            var packageName = parts[0];
            var architecture = parts[1];
            var componentName = undefined;
            var keys = Object.keys(moduleMapping);
            for (var key in  keys) {
                var name = keys[key];
                if (packageName.startsWith(name) && packageName.length > (name.length + 2) &&
                        packageName[name.length] == '-') {
                    componentName = packageName.slice(name.length + 1).replace('-', '_');
                    packageName = moduleMapping[name];
                    break;
                }
            }
            // Update components
            if (Object.keys(packages).contains(packageName)) {
                if (!packages[packageName].components.contains(componentName))
                    packages[packageName].components.push(componentName);
            }
        }

        var extraVariables = [];
        if (useBoostStaticLibs)
            extraVariables.push("-DBoost_USE_STATIC_LIBS=ON");

        return CMakeSetup.doSetup(packages, outputBaseDir, path, qbs, cmakeToolChainFile,
                                  extraVariables);
    }
}
