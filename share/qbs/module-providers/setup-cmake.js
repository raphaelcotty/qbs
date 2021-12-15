/****************************************************************************
**
** Copyright (C) 2022 Raphaël Cotty <raphael.cotty@gmail.com>
** Contact: http://www.qt.io/licensing
**
** This file is part of the Qbs.
**
** Commercial License Usage
** Licensees holding valid commercial Qt licenses may use this file in
** accordance with the commercial license agreement provided with the
** Software or, alternatively, in accordance with the terms contained in
** a written agreement between you and The Qt Company. For licensing terms and
** conditions see http://www.qt.io/terms-conditions. For further information
** use the contact form at http://www.qt.io/contact-us.
**
** GNU Lesser General Public License Usage
** Alternatively, this file may be used under the terms of the GNU Lesser
** General Public License version 2.1 or version 3 as published by the Free
** Software Foundation and appearing in the file LICENSE.LGPLv21 and
** LICENSE.LGPLv3 included in the packaging of this file.  Please review the
** following information to ensure the GNU Lesser General Public License
** requirements will be met: https://www.gnu.org/licenses/lgpl.html and
** http://www.gnu.org/licenses/old-licenses/lgpl-2.1.html.
**
** In addition, as a special exception, The Qt Company gives you certain additional
** rights.  These rights are described in The Qt Company LGPL Exception
** version 1.1, included in the file LGPL_EXCEPTION.txt in this package.
**
****************************************************************************/

var Environment = require("qbs.Environment");
var File = require("qbs.File");
var FileInfo = require("qbs.FileInfo");
var ModUtils = require("qbs.ModUtils");
var Process = require("qbs.Process");
var TemporaryDir = require("qbs.TemporaryDir");
var TextFile = require("qbs.TextFile")

function runCMake(cmakeFilePath, cmakeDirectoryPath, cmakeToolChainFile, extraVariables) {
    var p = new Process();
    var args = ["-S", cmakeDirectoryPath, "-B", cmakeDirectoryPath];
    if (cmakeToolChainFile)
        args.push("-DCMAKE_TOOLCHAIN_FILE=" + cmakeToolChainFile);
    if (extraVariables) {
        extraVariables.forEach(function(variable) {
            args.push(variable);
        });
    }

    p.exec(cmakeFilePath, args);
    console.warn(cmakeFilePath+" "+args);
    console.warn(p.readStdOut());
    console.warn(p.readStdErr());
    if (p.exitCode() !== 0) {
        throw "qmake failed with exit code: " + p.exitCode();
    }
}

function logModule(module) {
    console.warn("Module: " + module.name + " (" + module.version + "), dynamicLibraries: " +
                 module.dynamicLibraries + ", staticLibraries: " +  module.staticLibraries +
                 ", defines: " + module.defines + ", dependencies: " + module.dependencies +
                 ", includes: " + module.includePaths);
}

function addCMakeProperty(file, packageName, componentName, propertyName, cmakePropertyName) {
    var prop = packageName + "_" + componentName + "_" + propertyName;
    file.writeLine("get_property(" + prop + " TARGET " + packageName + "::" + componentName +
                   " PROPERTY " + cmakePropertyName + ")");
    file.writeLine("set(" + prop + " ${" + prop + "} CACHE STRING \"" + packageName + " " +
                   componentName + " " + propertyName + "\")");
}

function addCMakeSimpleProperty(file, packageName, propertyName, cmakePropertyName) {
    var prop = packageName + "_" + propertyName;
    file.writeLine("get_property(" + prop + " TARGET " + packageName + " PROPERTY " +
                   cmakePropertyName + ")");
    file.writeLine("set(" + prop + " ${" + prop + "} CACHE STRING \"" + packageName + " " +
                   propertyName + "\")");
}

function getPackageComponent(key, packages) {
    var packageNames = Object.keys(packages);
    if (packageNames.contains(key))
        return {packageName: key, componentName: ""};
    for (var packageName in packages) {
        var pack = packages[packageName];
        var components = pack.components;
        if (key.startsWith(packageName.toLowerCase() + '_')) {
            var componentName = key.slice(packageName.length + 1);
            var index = components.indexOf(componentName);
            if (index >= 0)
                return {packageName: packageName, componentName: componentName};
        } else if (key.startsWith(packageName)) {
            componentName = key.slice(packageName.length);
            index = components.indexOf(componentName);
            if (index >= 0)
                return {packageName: packageName, componentName: componentName};
        }
    }
    return {moduleName: "", subModuleName: ""};
}

function findPackages(packages, workingDirectoryPath, cmakeFilePath, cmakeToolChainFile,
                      extraVariables) {
    var cmakeListsFileName = FileInfo.joinPaths(workingDirectoryPath, "CMakeLists.txt");
    var cmakeListsFile = new TextFile(cmakeListsFileName, TextFile.WriteOnly);
    cmakeListsFile.writeLine("project(qbs)");
    cmakeListsFile.writeLine("cmake_minimum_required(VERSION 3.5)");
    for (var packageName in packages) {
        var pkg = packages[packageName];
        if (pkg.components) {
            cmakeListsFile.writeLine("find_package(" + pkg.name + " OPTIONAL_COMPONENTS " +
                                     pkg.components.join(' ') + ")");
        } else {
            cmakeListsFile.writeLine("find_package(" + pkg.name + ")");
        }
    }

    cmakeListsFile.close();

    runCMake(cmakeFilePath, workingDirectoryPath, cmakeToolChainFile, extraVariables);

    var cmakeCacheFileName = FileInfo.joinPaths(workingDirectoryPath, "CMakeCache.txt");
    var cmakeCacheFile = new TextFile(cmakeCacheFileName, TextFile.ReadOnly);

    var detectedSubModules = [];
    while (!cmakeCacheFile.atEof()) {
        var line = cmakeCacheFile.readLine();
        var regexp = new RegExp("^([a-zA-Z0-9_]+)_DIR:PATH=(.*)$");
        var match = regexp.exec(line);
        if (!match)
            continue;
        var key = match[1];
        var value = match[2];
        if (value.endsWith("-NOTFOUND"))
            continue;
        var packageComponent = getPackageComponent(key, packages);
        packageName = packageComponent.packageName;
        if (!Object.keys(packages).contains(packageName))
            continue;
        var componentName = packageComponent.componentName;
        if (!componentName)
            continue;
        if (!packages[packageName].detectedComponents)
            packages[packageName].detectedComponents = [];
        packages[packageName].detectedComponents.push(componentName);
    }
    cmakeCacheFile.close();
    return packages;
}

function getModuleSubModule(key, modules) {
    var moduleNames = Object.keys(modules);
    if (moduleNames.contains(key))
        return {moduleName: key, subModuleName: ""};
    for (var moduleName in modules) {
        var mod = modules[moduleName];
        var subMods = mod.subModules;
        if (key.startsWith(moduleName + '_')) {
            var subModuleName = key.slice(moduleName.length + 1);
            var subModuleNames = Object.keys(mod);
            if (Object.keys(subMods).contains(subModuleName))
                return {moduleName: moduleName, subModuleName: subModuleName};
        }
    }
    return {moduleName: "", subModuleName: ""};
}

function doSetup(cmakeFilePath, packages, outputBaseDir, location, qbs, cmakeToolChainFile,
                 extraVariables) {
    var cmakeDirectory = new TemporaryDir();
    //var cmakeDirectoryPath = "/tmp/";
    var cmakeDirectoryPath = cmakeDirectory.path();
    File.makePath(cmakeDirectoryPath);
    var detectedPackages = findPackages(packages, cmakeDirectoryPath, cmakeFilePath,
                                        cmakeToolChainFile, extraVariables);

    cmakeListsFileName = FileInfo.joinPaths(cmakeDirectoryPath, "CMakeLists.txt");
    cmakeListsFile = new TextFile(cmakeListsFileName, TextFile.Append);

    for (var packageName in detectedPackages) {
        var pkg = detectedPackages[packageName];

        cmakeListsFile.writeLine("set(" + packageName + "_VERSION ${" + packageName +
                                 "_VERSION} " + "CACHE STRING \"" + packageName +
                                 " version\")");
        if (pkg.detectedComponents) {
            for (var m = 0; m < pkg.detectedComponents.length; ++m) {
                var componentName = pkg.detectedComponents[m];
                addCMakeProperty(cmakeListsFile, packageName, componentName, "compileDefines",
                                 "INTERFACE_COMPILE_DEFINITIONS");
                addCMakeProperty(cmakeListsFile, packageName, componentName, "compileFeatures",
                                 "INTERFACE_COMPILE_FEATURE");
                addCMakeProperty(cmakeListsFile, packageName, componentName, "compileOptions",
                                 "INTERFACE_COMPILE_OPTIONS");

                addCMakeProperty(cmakeListsFile, packageName, componentName, "includePaths",
                                 "INTERFACE_INCLUDE_DIRECTORIES");
                addCMakeProperty(cmakeListsFile, packageName, componentName, "systemIncludePaths",
                                 "INTERFACE_SYSTEM_INCLUDE_DIRECTORIES");

                addCMakeProperty(cmakeListsFile, packageName, componentName, "dependencies",
                                 "INTERFACE_LINK_LIBRARIES");
                addCMakeProperty(cmakeListsFile, packageName, componentName, "linkOptions",
                                 "INTERFACE_LINK_OPTIONS");
                addCMakeProperty(cmakeListsFile, packageName, componentName, "libraryPaths",
                                 "INTERFACE_LINK_DIRECTORIES");
                addCMakeProperty(cmakeListsFile, packageName, componentName, "configurations",
                                 "IMPORTED_CONFIGURATIONS");
                addCMakeProperty(cmakeListsFile, packageName, componentName, "location",
                                 "IMPORTED_LOCATION_${" + packageName + "_" + componentName +
                                 "_configurations}");
            }
        } else {
            addCMakeSimpleProperty(cmakeListsFile, packageName, "compileDefines",
                             "INTERFACE_COMPILE_DEFINITIONS");
            addCMakeSimpleProperty(cmakeListsFile, packageName, "compileFeatures",
                             "INTERFACE_COMPILE_FEATURE");
            addCMakeSimpleProperty(cmakeListsFile, packageName, "compileOptions",
                             "INTERFACE_COMPILE_OPTIONS");

            addCMakeSimpleProperty(cmakeListsFile, packageName, "includePaths",
                             "INTERFACE_INCLUDE_DIRECTORIES");
            addCMakeSimpleProperty(cmakeListsFile, packageName, "systemIncludePaths",
                             "INTERFACE_SYSTEM_INCLUDE_DIRECTORIES");

            addCMakeSimpleProperty(cmakeListsFile, packageName, "dependencies",
                             "INTERFACE_LINK_LIBRARIES");
            addCMakeSimpleProperty(cmakeListsFile, packageName, "linkOptions",
                             "INTERFACE_LINK_OPTIONS");
            addCMakeSimpleProperty(cmakeListsFile, packageName, "libraryPaths",
                             "INTERFACE_LINK_DIRECTORIES");
            addCMakeSimpleProperty(cmakeListsFile, packageName, "configurations",
                             "IMPORTED_CONFIGURATIONS");
            addCMakeSimpleProperty(cmakeListsFile, packageName, "location",
                             "IMPORTED_LOCATION_${" + packageName + "_configurations}");
        }
    }
    cmakeListsFile.close();

    runCMake(cmakeFilePath, cmakeDirectoryPath, cmakeToolChainFile, extraVariables);

    cmakeCacheFileName = FileInfo.joinPaths(cmakeDirectoryPath, "CMakeCache.txt");
    cmakeCacheFile = new TextFile(cmakeCacheFileName, TextFile.ReadOnly);

    var modulesMap = {};
    for (packageName in detectedPackages) {
        var subModulesMap = {};
        pkg = detectedPackages[packageName];
        if (!pkg.detectedComponents) {
            subModulesMap.name = packageName;
            subModulesMap.version = "";
            subModulesMap.includePaths = [];
            subModulesMap.systemIncludePaths = [];
            subModulesMap.defines = [];
            subModulesMap.commonCompilerFlags = [];
            subModulesMap.dynamicLibraries = [];
            subModulesMap.staticLibraries = [];
            subModulesMap.libraryPaths = [];
            subModulesMap.frameworks = [];
            subModulesMap.frameworkPaths = [];
            subModulesMap.driverLinkerFlags = [];
            subModulesMap.dependencies = [];
        } else {
            subModulesMap.subModules = {};
            for (m = 0; m < pkg.detectedComponents.length; ++m) {
                var subModule = {};
                subModule.name = pkg.detectedComponents[m];
                subModulesMap.version = "";
                subModule.includePaths = [];
                subModule.systemIncludePaths = [];
                subModule.defines = [];
                subModule.commonCompilerFlags = [];
                subModule.dynamicLibraries = [];
                subModule.staticLibraries = [];
                subModule.libraryPaths = [];
                subModule.frameworks = [];
                subModule.frameworkPaths = [];
                subModule.driverLinkerFlags = [];
                subModule.dependencies = [];
                subModulesMap.subModules[subModule.name] = subModule;
            }
        }
        modulesMap[pkg.name] = subModulesMap;
    }

    var version = undefined;
    while (!cmakeCacheFile.atEof()) {
        var line = cmakeCacheFile.readLine();
        var regexp = new RegExp("^([a-zA-Z0-9_]+):(INTERNAL|FILEPATH|PATH|STRING|BOOL|STATIC|UNINITIALIZED){1}=(.*)$");
        var match = regexp.exec(line);
        if (!match)
            continue;
        var key = match[1];
        var value = match[3];
        var moduleName;
        var subModuleName;
        var versionKey = "_VERSION";
        var libraryKey = "_location";
        var includePathsKey = "_includePaths";
        var systemIncludePathsKey = "_systemIncludePaths";
        var definesKey = "_compileDefines";
        var linkOptionsKey = "_linkOptions";
        var libraryPathsOptionsKey = "_libraryPaths";
        var dependenciesKey = "_dependencies";
        if (key.endsWith(versionKey)) {
            moduleName = key.slice(0, key.length - versionKey.length);
            if (Object.keys(modulesMap).contains(moduleName))
                modulesMap[moduleName].version = value;
        }
        else {
            var moduleSubModuleName;
            var modSub;
            var modName;
            var subModName;

            function writeModuleProperty(modSub, key, value) {
                modName = modSub.moduleName;
                subModName = modSub.subModuleName;
                if (!modName || !value)
                    return;
                if (!subModName)
                    modulesMap[modName][key].push(value);
                else
                    modulesMap[modName].subModules[subModName][key].push(value);
            }

            function appendModuleProperty(modSub, key, value) {
                modName = modSub.moduleName;
                subModName = modSub.subModuleName;
                if (!modName)
                    return;
                if (!subModName)
                    modulesMap[modName][key] = modulesMap[modName][key].concat(value);
                else
                    modulesMap[modName].subModules[subModName][key] =
                            modulesMap[modName].subModules[subModName][key].concat(value);
            }

            if (key.endsWith(libraryKey)) {
                moduleSubModuleName = key.slice(0, key.length - libraryKey.length);
                modSub = getModuleSubModule(moduleSubModuleName, modulesMap);
                if (value.endsWith(".a"))
                    writeModuleProperty(modSub, "staticLibraries", value);
                else
                    writeModuleProperty(modSub, "dynamicLibraries",
                                        FileInfo.completeBaseName(value));
            } else if (key.endsWith(includePathsKey)) {
                moduleSubModuleName = key.slice(0, key.length - includePathsKey.length);
                modSub = getModuleSubModule(moduleSubModuleName, modulesMap);
                writeModuleProperty(modSub, "includePaths", value);
            } else if (key.endsWith(systemIncludePathsKey)) {
                moduleSubModuleName = key.slice(0, key.length - systemIncludePathsKey.length);
                modSub = getModuleSubModule(moduleSubModuleName, modulesMap);
                writeModuleProperty(modSub, "systemIncludePaths", value);
            } else if (key.endsWith(definesKey)) {
                moduleSubModuleName = key.slice(0, key.length - definesKey.length);
                modSub = getModuleSubModule(moduleSubModuleName, modulesMap);
                writeModuleProperty(modSub, "defines", value);
            } else if (key.endsWith(linkOptionsKey)) {
                moduleSubModuleName = key.slice(0, key.length - linkOptionsKey.length);
                modSub = getModuleSubModule(moduleSubModuleName, modulesMap);
                writeModuleProperty(modSub, "driverLinkerFlags", value);
            } else if (key.endsWith(libraryPathsOptionsKey)) {
                moduleSubModuleName = key.slice(0, key.length - libraryPathsOptionsKey.length);
                modSub = getModuleSubModule(moduleSubModuleName, modulesMap);
                writeModuleProperty(modSub, "libraryPaths", value);
            } else if (key.endsWith(dependenciesKey)) {
                moduleSubModuleName = key.slice(0, key.length - dependenciesKey.length);
                var additionalLibraries = [];
                var dependencies = [];
                var valueDependencies = value.length > 0 ? value.split(';') : undefined;
                for (var i in valueDependencies) {
                    var depName = valueDependencies[i];
                    if (depName === "Threads::Threads") {
                        additionalLibraries.push("pthread");
                    } else {
                        var nameSpacedPackageName = depName.split("::");
                        if (nameSpacedPackageName.length !== 2) {
                            additionalLibraries.push(depName);
                        } else {
                            dependencies.push(nameSpacedPackageName[0] + '.' +
                                              nameSpacedPackageName[1]);
                        }
                    }
                }

                modSub = getModuleSubModule(moduleSubModuleName, modulesMap);
                appendModuleProperty(modSub, "dependencies", dependencies);
                appendModuleProperty(modSub, "dynamicLibraries", additionalLibraries);
            }
        }
    }

    cmakeCacheFile.close();

    for (moduleName in modulesMap) {
        var moduleBaseDir = FileInfo.joinPaths(outputBaseDir, "modules", moduleName);
        var mod = modulesMap[moduleName];
        if (mod.subModules === undefined) {
            var deps = mod.dependencies;
            logModule(mod);
            var moduleDir = moduleBaseDir
            File.makePath(moduleDir);
            var module = new TextFile(FileInfo.joinPaths(moduleDir, "module.qbs"),
                                      TextFile.WriteOnly);
            module.writeLine("Module {");
            module.writeLine("    version: " + ModUtils.toJSLiteral(mod.version));
            module.writeLine("    Depends { name: 'cpp' }");
            deps.forEach(function(dep) {
                module.writeLine("    Depends { name: '" + dep + "' }");
            })
            function writeProperty(propertyName) {
                var value = mod[propertyName];
                if (value.length !== 0) { // skip empty props for simplicity of the module file
                    module.writeLine(
                            "    cpp." + propertyName + ":" + ModUtils.toJSLiteral(value));
                }
            }
            writeProperty("includePaths");
            writeProperty("systemIncludePaths");
            writeProperty("defines");
            writeProperty("commonCompilerFlags");
            writeProperty("dynamicLibraries");
            writeProperty("staticLibraries");
            writeProperty("libraryPaths");
            writeProperty("frameworks");
            writeProperty("frameworkPaths");
            writeProperty("driverLinkerFlags");
            module.writeLine("}");
            module.close();
        } else {
            var subMods = mod.subModules;
            for (var subModName in subMods) {
                var subMod = subMods[subModName];
                subMod.version = mod.version;
                var deps = subMod.dependencies;
                logModule(subMod);
                var moduleDir = FileInfo.joinPaths(moduleBaseDir, subModName);
                File.makePath(moduleDir);
                var module = new TextFile(FileInfo.joinPaths(moduleDir, "module.qbs"),
                                          TextFile.WriteOnly);
                module.writeLine("Module {");
                module.writeLine("    version: " + ModUtils.toJSLiteral(subMod.version));
                module.writeLine("    Depends { name: 'cpp' }");
                deps.forEach(function(dep) {
                    module.writeLine("    Depends { name: '" + dep + "' }");
                })
                function writeSubProperty(propertyName) {
                    var value = subMod[propertyName];
                    if (value.length !== 0) { // skip empty props for simplicity of the module file
                        module.writeLine(
                                "    cpp." + propertyName + ":" + ModUtils.toJSLiteral(value));
                    }
                }
                writeSubProperty("includePaths");
                writeSubProperty("systemIncludePaths");
                writeSubProperty("defines");
                writeSubProperty("commonCompilerFlags");
                writeSubProperty("dynamicLibraries");
                writeSubProperty("staticLibraries");
                writeSubProperty("libraryPaths");
                writeSubProperty("frameworks");
                writeSubProperty("frameworkPaths");
                writeSubProperty("driverLinkerFlags");
                module.writeLine("}");
                module.close();
            }
        }
    }

    return "";
}

