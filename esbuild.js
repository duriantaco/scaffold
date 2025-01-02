const { context, build } = require('esbuild');
const { argv } = require('process');

const isWatch = argv.includes('--watch');
const isProduction = argv.includes('--production');

const baseConfig = {
    entryPoints: ['./src/extension.ts'],
    bundle: true,
    outfile: './out/extension.js',
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
    minify: isProduction,
    sourcemap: !isProduction,
    target: 'node16',
};

async function runBuild() {
    try {
        if (isWatch) {
            const ctx = await context(baseConfig);
            await ctx.watch();
            console.log('Watching...');
        } else {
            await build(baseConfig);
            console.log('Build complete');
        }
    } catch (err) {
        console.error('Build failed:', err);
        process.exit(1);
    }
}

runBuild();