/****************************************************************************
**
** Copyright (C) 2012 Digia Plc and/or its subsidiary(-ies).
** Contact: http://www.qt-project.org/legal
**
** This file is part of the Qt Build Suite.
**
** Commercial License Usage
** Licensees holding valid commercial Qt licenses may use this file in
** accordance with the commercial license agreement provided with the
** Software or, alternatively, in accordance with the terms contained in
** a written agreement between you and Digia.  For licensing terms and
** conditions see http://qt.digia.com/licensing.  For further information
** use the contact form at http://qt.digia.com/contact-us.
**
** GNU Lesser General Public License Usage
** Alternatively, this file may be used under the terms of the GNU Lesser
** General Public License version 2.1 as published by the Free Software
** Foundation and appearing in the file LICENSE.LGPL included in the
** packaging of this file.  Please review the following information to
** ensure the GNU Lesser General Public License version 2.1 requirements
** will be met: http://www.gnu.org/licenses/old-licenses/lgpl-2.1.html.
**
** In addition, as a special exception, Digia gives you certain additional
** rights.  These rights are described in the Digia Qt LGPL Exception
** version 1.1, included in the file LGPL_EXCEPTION.txt in this package.
**
****************************************************************************/

#include "language.h"
#include "qbsengine.h"
#include <tools/scripttools.h>
#include <QCryptographicHash>
#include <QMutexLocker>
#include <QScriptValue>
#include <algorithm>

QT_BEGIN_NAMESPACE
inline QDataStream& operator>>(QDataStream &stream, qbs::JsImport &jsImport)
{
    stream >> jsImport.scopeName
           >> jsImport.fileNames
           >> jsImport.location;
    return stream;
}

inline QDataStream& operator<<(QDataStream &stream, const qbs::JsImport &jsImport)
{
    return stream << jsImport.scopeName
                  << jsImport.fileNames
                  << jsImport.location;
}
QT_END_NAMESPACE

namespace qbs {

Configuration::Configuration()
{
}

Configuration::Configuration(const Configuration &other)
    : m_value(other.m_value), m_scriptValueCache(other.m_scriptValueCache)
{
}

void Configuration::setValue(const QVariantMap &map)
{
    m_value = map;
    m_scriptValueCache.clear();
}

QScriptValue Configuration::cachedScriptValue(QScriptEngine *scriptEngine) const
{
    QMutexLocker ml(&m_scriptValueCacheMutex);
    const QScriptValue result = m_scriptValueCache.value(scriptEngine);
    Q_ASSERT(!result.isValid() || result.engine() == scriptEngine);
    return result;
}

void Configuration::cacheScriptValue(const QScriptValue &scriptValue)
{
    QMutexLocker ml(&m_scriptValueCacheMutex);
    m_scriptValueCache.insert(scriptValue.engine(), scriptValue);
}

void Configuration::load(PersistentPool &, QDataStream &s)
{
    s >> m_value;
}

void Configuration::store(PersistentPool &, QDataStream &s) const
{
    s << m_value;
}

void FileTagger::load(PersistentPool &pool, QDataStream &s)
{
    Q_UNUSED(s);
    m_artifactExpression.setPattern(pool.idLoadString());
    m_fileTags = pool.idLoadStringList();
}

void FileTagger::store(PersistentPool &pool, QDataStream &s) const
{
    Q_UNUSED(s);
    pool.storeString(m_artifactExpression.pattern());
    pool.storeStringList(m_fileTags);
}

void SourceArtifact::load(PersistentPool &pool, QDataStream &s)
{
    s >> absoluteFilePath;
    s >> fileTags;
    configuration = pool.idLoadS<Configuration>(s);
}

void SourceArtifact::store(PersistentPool &pool, QDataStream &s) const
{
    s << absoluteFilePath;
    s << fileTags;
    pool.store(configuration);
}

void RuleArtifact::load(PersistentPool &pool, QDataStream &s)
{
    Q_UNUSED(pool);
    s >> fileScript;
    s >> fileTags;

    int i;
    s >> i;
    bindings.clear();
    bindings.reserve(i);
    Binding binding;
    for (; --i >= 0;) {
        s >> binding.name >> binding.code >> binding.location;
        bindings += binding;
    }
}

void RuleArtifact::store(PersistentPool &pool, QDataStream &s) const
{
    Q_UNUSED(pool);
    s << fileScript;
    s << fileTags;

    s << bindings.count();
    for (int i = bindings.count(); --i >= 0;) {
        const Binding &binding = bindings.at(i);
        s << binding.name << binding.code << binding.location;
    }
}

void RuleScript::load(PersistentPool &, QDataStream &s)
{
    s >> script;
    s >> location;
}

void RuleScript::store(PersistentPool &, QDataStream &s) const
{
    s << script;
    s << location;
}

void ResolvedModule::load(PersistentPool &pool, QDataStream &s)
{
    name = pool.idLoadString();
    moduleDependencies = pool.idLoadStringList();
    setupBuildEnvironmentScript = pool.idLoadString();
    setupRunEnvironmentScript = pool.idLoadString();
    s >> jsImports
      >> setupBuildEnvironmentScript
      >> setupRunEnvironmentScript;
}

void ResolvedModule::store(PersistentPool &pool, QDataStream &s) const
{
    pool.storeString(name);
    pool.storeStringList(moduleDependencies);
    pool.storeString(setupBuildEnvironmentScript);
    pool.storeString(setupRunEnvironmentScript);
    s << jsImports
      << setupBuildEnvironmentScript
      << setupRunEnvironmentScript;
}

QString Rule::toString() const
{
    return "[" + inputs.join(",") + " -> " + outputFileTags().join(",") + "]";
}

QStringList Rule::outputFileTags() const
{
    QStringList result;
    foreach (const RuleArtifact::ConstPtr &artifact, artifacts)
        result.append(artifact->fileTags);
    result.sort();
    std::unique(result.begin(), result.end());
    return result;
}

void Rule::load(PersistentPool &pool, QDataStream &s)
{
    script = pool.idLoadS<RuleScript>(s);
    module = pool.idLoadS<ResolvedModule>(s);
    s   >> jsImports
        >> inputs
        >> usings
        >> explicitlyDependsOn
        >> multiplex
        >> objectId
        >> transformProperties;

    loadContainerS(artifacts, s, pool);
}

void Rule::store(PersistentPool &pool, QDataStream &s) const
{
    pool.store(script);
    pool.store(module);
    s   << jsImports
        << inputs
        << usings
        << explicitlyDependsOn
        << multiplex
        << objectId
        << transformProperties;

    storeContainer(artifacts, s, pool);
}

void Group::load(PersistentPool &pool, QDataStream &s)
{
    prefix = pool.idLoadString();
    patterns = pool.idLoadStringList();
    excludePatterns = pool.idLoadStringList();
    files = pool.idLoadStringSet();
    s >> recursive;
}

void Group::store(PersistentPool &pool, QDataStream &s) const
{
    pool.storeString(prefix);
    pool.storeStringList(patterns);
    pool.storeStringList(excludePatterns);
    pool.storeStringSet(files);
    s << recursive;
}

ResolvedProduct::ResolvedProduct()
    : project(0)
{
}

QSet<QString> ResolvedProduct::fileTagsForFileName(const QString &fileName) const
{
    QSet<QString> result;
    foreach (FileTagger::ConstPtr tagger, fileTaggers) {
        if (FileInfo::globMatches(tagger->artifactExpression(), fileName)) {
            result.unite(tagger->fileTags().toSet());
        }
    }
    return result;
}

void ResolvedProduct::load(PersistentPool &pool, QDataStream &s)
{
    s   >> fileTags
        >> name
        >> targetName
        >> buildDirectory
        >> sourceDirectory
        >> destinationDirectory
        >> qbsFile;

    configuration = pool.idLoadS<Configuration>(s);
    loadContainerS(sources, s, pool);
    loadContainerS(rules, s, pool);
    loadContainerS(uses, s, pool);
    loadContainerS(fileTaggers, s, pool);
    loadContainerS(modules, s, pool);
    loadContainerS(groups, s, pool);
}

void ResolvedProduct::store(PersistentPool &pool, QDataStream &s) const
{
    s   << fileTags
        << name
        << targetName
        << buildDirectory
        << sourceDirectory
        << destinationDirectory
        << qbsFile;

    pool.store(configuration);
    storeContainer(sources, s, pool);
    storeContainer(rules, s, pool);
    storeContainer(uses, s, pool);
    storeContainer(fileTaggers, s, pool);
    storeContainer(modules, s, pool);
    storeContainer(groups, s, pool);
}

QList<const ResolvedModule*> topSortModules(const QHash<const ResolvedModule*, QList<const ResolvedModule*> > &moduleChildren,
                                      const QList<const ResolvedModule*> &modules,
                                      QSet<QString> &seenModuleNames)
{
    QList<const ResolvedModule*> result;
    foreach (const ResolvedModule *m, modules) {
        if (m->name.isNull())
            continue;
        result.append(topSortModules(moduleChildren, moduleChildren.value(m), seenModuleNames));
        if (!seenModuleNames.contains(m->name)) {
            seenModuleNames.insert(m->name);
            result.append(m);
        }
    }
    return result;
}

static QScriptValue js_getenv(QScriptContext *context, QScriptEngine *engine)
{
    if (context->argumentCount() < 1)
        return context->throwError(QScriptContext::SyntaxError,
                                   QLatin1String("getenv expects 1 argument"));
    QVariant v = engine->property("_qbs_procenv");
    QProcessEnvironment *procenv = reinterpret_cast<QProcessEnvironment*>(v.value<void*>());
    return engine->toScriptValue(procenv->value(context->argument(0).toString()));
}

static QScriptValue js_putenv(QScriptContext *context, QScriptEngine *engine)
{
    if (context->argumentCount() < 2)
        return context->throwError(QScriptContext::SyntaxError,
                                   QLatin1String("putenv expects 2 arguments"));
    QVariant v = engine->property("_qbs_procenv");
    QProcessEnvironment *procenv = reinterpret_cast<QProcessEnvironment*>(v.value<void*>());
    procenv->insert(context->argument(0).toString(), context->argument(1).toString());
    return engine->undefinedValue();
}

enum EnvType
{
    BuildEnv, RunEnv
};

static QProcessEnvironment getProcessEnvironment(QbsEngine *engine, EnvType envType,
                                                 const QList<ResolvedModule::ConstPtr> &modules,
                                                 const Configuration::ConstPtr &productConfiguration,
                                                 ResolvedProject *project,
                                                 const QProcessEnvironment &systemEnvironment)
{
    QProcessEnvironment procenv = systemEnvironment;

    // Copy the environment of the platform configuration to the process environment.
    const QVariantMap &platformEnv = project->platformEnvironment;
    for (QVariantMap::const_iterator it = platformEnv.constBegin(); it != platformEnv.constEnd(); ++it)
        procenv.insert(it.key(), it.value().toString());

    QMap<QString, const ResolvedModule *> moduleMap;
    foreach (const ResolvedModule::ConstPtr &module, modules)
        moduleMap.insert(module->name, module.data());

    QHash<const ResolvedModule*, QList<const ResolvedModule*> > moduleParents;
    QHash<const ResolvedModule*, QList<const ResolvedModule*> > moduleChildren;
    foreach (ResolvedModule::ConstPtr module, modules) {
        foreach (const QString &moduleName, module->moduleDependencies) {
            const ResolvedModule * const depmod = moduleMap.value(moduleName);
            moduleParents[depmod].append(module.data());
            moduleChildren[module.data()].append(depmod);
        }
    }

    QList<const ResolvedModule *> rootModules;
    foreach (ResolvedModule::ConstPtr module, modules)
        if (moduleParents.value(module.data()).isEmpty())
            rootModules.append(module.data());

    {
        QVariant v;
        v.setValue<void*>(&procenv);
        engine->setProperty("_qbs_procenv", v);
    }

    QSet<QString> seenModuleNames;
    QList<const ResolvedModule *> topSortedModules = topSortModules(moduleChildren, rootModules, seenModuleNames);
    foreach (const ResolvedModule *module, topSortedModules) {
        if ((envType == BuildEnv && module->setupBuildEnvironmentScript.isEmpty()) ||
            (envType == RunEnv && module->setupBuildEnvironmentScript.isEmpty() && module->setupRunEnvironmentScript.isEmpty()))
            continue;

        QScriptContext *ctx = engine->pushContext();

        // expose functions
        ctx->activationObject().setProperty("getenv", engine->newFunction(js_getenv, 1));
        ctx->activationObject().setProperty("putenv", engine->newFunction(js_putenv, 2));

        // handle imports
        engine->import(module->jsImports, QScriptValue(), engine->currentContext()->activationObject());

        // expose properties of direct module dependencies
        QScriptValue scriptValue;
        QScriptValue activationObject = ctx->activationObject();
        QVariantMap productModules = productConfiguration->value().value("modules").toMap();
        foreach (const ResolvedModule * const depmod, moduleChildren.value(module)) {
            scriptValue = engine->newObject();
            QVariantMap moduleCfg = productModules.value(depmod->name).toMap();
            for (QVariantMap::const_iterator it = moduleCfg.constBegin(); it != moduleCfg.constEnd(); ++it)
                scriptValue.setProperty(it.key(), engine->toScriptValue(it.value()));
            activationObject.setProperty(depmod->name, scriptValue);
        }

        // expose the module's properties
        QVariantMap moduleCfg = productModules.value(module->name).toMap();
        for (QVariantMap::const_iterator it = moduleCfg.constBegin(); it != moduleCfg.constEnd(); ++it)
            activationObject.setProperty(it.key(), engine->toScriptValue(it.value()));

        QString setupScript;
        if (envType == BuildEnv) {
            setupScript = module->setupBuildEnvironmentScript;
        } else {
            if (module->setupRunEnvironmentScript.isEmpty()) {
                setupScript = module->setupBuildEnvironmentScript;
            } else {
                setupScript = module->setupRunEnvironmentScript;
            }
        }
        scriptValue = engine->evaluate(setupScript);
        if (scriptValue.isError() || engine->hasUncaughtException()) {
            QString envTypeStr = (envType == BuildEnv ? "build" : "run");
            throw Error(QString("Error while setting up %1 environment: %2").arg(envTypeStr, scriptValue.toString()));
        }

        engine->popContext();
    }

    engine->setProperty("_qbs_procenv", QVariant());
    return procenv;
}

void ResolvedProduct::setupBuildEnvironment(QbsEngine *engine, const QProcessEnvironment &systemEnvironment) const
{
    if (!buildEnvironment.isEmpty())
        return;

    buildEnvironment = getProcessEnvironment(engine, BuildEnv, modules, configuration, project, systemEnvironment);
}

void ResolvedProduct::setupRunEnvironment(QbsEngine *engine, const QProcessEnvironment &systemEnvironment) const
{
    if (!runEnvironment.isEmpty())
        return;

    runEnvironment = getProcessEnvironment(engine, RunEnv, modules, configuration, project, systemEnvironment);
}

void ResolvedProject::load(PersistentPool &pool, QDataStream &s)
{
    s >> id;
    s >> qbsFile;
    s >> platformEnvironment;

    int count;
    s >> count;
    products.clear();
    products.reserve(count);
    for (; --count >= 0;) {
        ResolvedProduct::Ptr rProduct = pool.idLoadS<ResolvedProduct>(s);
        rProduct->project = this;
        products.insert(rProduct);
    }
}

void ResolvedProject::store(PersistentPool &pool, QDataStream &s) const
{
    s << id;
    s << qbsFile;
    s << platformEnvironment;

    s << products.count();
    foreach (const ResolvedProduct::ConstPtr &product, products)
        pool.store(product);
}

} // namespace qbs
