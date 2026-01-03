import gulp from 'gulp'
import zip from 'gulp-zip'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const buildTarget = process.env.BUILD_TARGET || 'chrome';
const manifest = require('../build/manifest.json')

gulp
  .src('build/**')
  .pipe(zip(`${manifest.name.replaceAll(' ', '-')}-${manifest.version}-${buildTarget}.zip`))
  .pipe(gulp.dest('package'))
