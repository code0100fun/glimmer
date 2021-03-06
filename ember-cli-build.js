/*jshint node:true*/

var path = require('path');
var existsSync = require('exists-sync');
var concat = require('broccoli-concat');
var merge = require('broccoli-merge-trees');
var typescript = require('broccoli-typescript-compiler');
var transpileES6 = require('emberjs-build/lib/utils/transpile-es6');
var handlebarsInlinedTrees = require('./build-support/handlebars-inliner');
var stew = require('broccoli-stew');
var mv = stew.mv;
var find = stew.find;
var rename = stew.rename;

function transpile(tree, label) {
  return transpileES6(tree, label, { sourceMaps: 'inline' });
}

function buildTSOptions(compilerOptions) {
  var tsOptions = {
    tsconfig: {
      compilerOptions: {
        target: "es2015",
        inlineSourceMap: true,
        inlineSources: true,
        moduleResolution: "node",

        /* needed to get typescript to emit the desired sourcemaps */
        rootDir: '.',
        mapRoot: '/'
      }
    }
  };

  Object.assign(tsOptions.tsconfig.compilerOptions, compilerOptions);

  return tsOptions;
}

module.exports = function() {
  var packages = __dirname + '/packages';
  var bower = __dirname + '/bower_components';
  var hasBower = existsSync(bower);

  var tsOptions = buildTSOptions();

  var demoTrees = [
    find(__dirname + '/demos', {
      include: ['*.html'],
      destDir: 'demos'
    }),
    find(__dirname + '/bench', {
      include: ['*.html'],
      destDir: 'demos'
    })
  ];

  var benchmarkPath = __dirname + '/node_modules/benchmark';
  if (existsSync(benchmarkPath)) {
    demoTrees.push(find(benchmarkPath, {
      include: ['benchmark.js'],
      destDir: 'demos'
    }));
  }
  var demos = merge(demoTrees);

  /*
   * ES6 Build
   */
  var tokenizerPath = path.join(require.resolve('simple-html-tokenizer'), '..', '..', 'lib');
  // TODO: WAT, why does { } change the output so much....
  var HTMLTokenizer = find(tokenizerPath, { });

  var tsTree = find(packages, {
    include: ['**/*.ts'],
    exclude: ['**/*.d.ts']
  });

  var jsTree = typescript(tsTree, tsOptions);

  var libTree = find(jsTree, {
    include: ['*/index.js', '*/lib/**/*.js']
  });

  libTree = merge([libTree, HTMLTokenizer, handlebarsInlinedTrees.compiler]);

  var es6LibTree = mv(libTree, 'es6');

  /*
   * ES5 Named AMD Build
   */
  libTree = transpile(libTree, 'ES5 Lib Tree');
  var es5LibTree = mv(libTree, 'named-amd');

  /*
   * CommonJS Build
   */
  tsOptions = buildTSOptions({
    module: "commonjs",
    target: "es5"
  });

  var cjsTree = typescript(tsTree, tsOptions);

  // SimpleHTMLTokenizer ships as either ES6 or a single AMD-ish file, so we have to
  // compile it from ES6 modules to CJS using TypeScript. broccoli-typescript-compiler
  // only works with `.ts` files, so we rename the `.js` files to `.ts` first.
  var simpleHTMLTokenizerLib = rename(tokenizerPath, '.js', '.ts');
  var simpleHTMLTokenizerJSTree = typescript(simpleHTMLTokenizerLib, tsOptions);
  var handlebarsPath = path.join(require.resolve('handlebars'), '..', '..', 'dist', 'cjs');

  cjsTree = merge([cjsTree, simpleHTMLTokenizerJSTree, handlebarsPath]);

  // Glimmer packages require other Glimmer packages using non-relative module names
  // (e.g., `glimmer-compiler` may import `glimmer-util` instead of `../glimmer-util`),
  // which doesn't work with Node's module resolution strategy.
  // As a workaround, naming the CommonJS directory `node_modules` allows us to treat each
  // package inside as a top-level module.
  cjsTree = mv(cjsTree, 'node_modules');

  /*
   * Anonymous AMD Build
   */
  var glimmerCommon = find(libTree, {
    include: [
      'glimmer/**/*.js',
      'glimmer-object/**/*.js',
      'glimmer-object-reference/**/*.js',
      'glimmer-reference/**/*.js',
      'glimmer-util/**/*.js',
      'glimmer-wire-format/**/*.js'
    ]
  });

  var glimmerRuntime = find(libTree, {
    include: ['glimmer-runtime/**/*']
  });

  var glimmerCompiler = merge([
    find(libTree, {
      include: [
        'glimmer-syntax/**/*.js',
        'glimmer-compiler/**/*.js',
        'simple-html-tokenizer/**/*.js',
        'handlebars/**/*.js'
      ]
    })
  ]);

  var glimmerDemos = merge([
    find(libTree, {
      include: [
        'glimmer-test-helpers/**/*.js',
        'glimmer-demos/**/*.js',
      ]
    })
  ]);

  var glimmerTests = merge([
    find(jsTree, { include: ['*/tests/**/*.js'] }),
    find(jsTree, { include: ['glimmer-test-helpers/**/*.js'] })
  ]);

  glimmerTests = transpile(glimmerTests, 'glimmer-tests');

  // Test Assets

  var testHarnessTrees = [
    find(__dirname + '/tests', {
      srcDir: '/',
      files: [ 'index.html' ],
      destDir: '/tests'
    })
  ];

  if (hasBower) {
    testHarnessTrees.push(find(bower, {
      srcDir: '/qunit/qunit',
      destDir: '/tests'
    }));
  }

  var testHarness = merge(testHarnessTrees);

  glimmerCommon = concat(glimmerCommon, {
    inputFiles: ['**/*.js'],
    outputFile: '/amd/glimmer-common.amd.js',
    sourceMapConfig: {
      enabled: true,
      cache: null,
      sourceRoot: '/'
    }
  });

  glimmerCompiler = concat(glimmerCompiler, {
    inputFiles: ['**/*.js'],
    outputFile: '/amd/glimmer-compiler.amd.js',
    sourceMapConfig: {
      enabled: true,
      cache: null,
      sourceRoot: '/'
    }
  });

  glimmerRuntime = concat(glimmerRuntime, {
    inputFiles: ['**/*.js'],
    outputFile: '/amd/glimmer-runtime.amd.js',
    sourceMapConfig: {
      enabled: true,
      cache: null,
      sourceRoot: '/'
    }
  });

  glimmerDemos = concat(glimmerDemos, {
    inputFiles: ['**/*.js'],
    outputFile: '/amd/glimmer-demos.amd.js',
    sourceMapConfig: {
      enabled: true,
      cache: null,
      sourceRoot: '/'
    }
  });

  glimmerTests = concat(glimmerTests, {
    inputFiles: ['**/*.js'],
    outputFile: '/amd/glimmer-tests.amd.js',
    sourceMapConfig: {
      enabled: true,
      cache: null,
      sourceRoot: '/'
    }
  });

  var finalTrees = [
    testHarness,
    demos,
    glimmerCommon,
    glimmerCompiler,
    glimmerRuntime,
    glimmerTests,
    glimmerDemos,
    cjsTree,
    es5LibTree,
    es6LibTree
  ];

  if (hasBower) {
    var loader = find(bower, {
      srcDir: '/loader.js',
      files: [ 'loader.js' ],
      destDir: '/assets'
    });

    finalTrees.push(loader);
  }

  return merge(finalTrees);
};
