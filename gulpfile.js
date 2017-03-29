"use strict";

const gulp = require("gulp");

// EsLint
const eslint = require('gulp-eslint');

// Babel
const babel = require('gulp-babel');


gulp.task('lint', () => {
    return gulp.src([
        "src/**/*.js",
        "gulpfile.js",
    ])
        .pipe(eslint())
        .pipe(eslint.format())
        .pipe(eslint.failAfterError());
});

gulp.task('build-lib', () => {
    return gulp.src([
        "src/**/*.js",
        "!src/bin/*",
    ])
        .pipe(babel())
        .pipe(gulp.dest('lib'));
});

gulp.task('build-cli', () => {
    return gulp.src("src/bin/*")
        .pipe(babel())
        .pipe(gulp.dest("bin"));
});

gulp.task('build', ['lint', 'build-lib', 'build-cli']);
