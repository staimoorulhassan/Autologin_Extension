const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: 'development',
  devtool: 'source-map',
  entry: {
    background: './src/background/worker.ts',
    popup: './src/popup/popup.tsx',
    content: './src/content/contentMain.ts'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true
          }
        },
        exclude: /node_modules/
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.json'],
    alias: {
      '@': path.resolve(__dirname, 'src/'),
      '@managers': path.resolve(__dirname, 'src/managers'),
      '@automation': path.resolve(__dirname, 'src/automation'),
      '@content': path.resolve(__dirname, 'src/content'),
      '@popup': path.resolve(__dirname, 'src/popup'),
      '@store': path.resolve(__dirname, 'src/store'),
      '@crypto': path.resolve(__dirname, 'src/crypto'),
      '@types': path.resolve(__dirname, 'src/types'),
      '@messaging': path.resolve(__dirname, 'src/messaging')
    }
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          from: 'manifest.json',
          to: 'manifest.json'
        },
        {
          from: 'public/',
          to: '.',
          noErrorOnMissing: true
        },
        {
          from: 'assets/',
          to: 'assets/',
          noErrorOnMissing: true
        }
      ]
    })
  ],
  performance: {
    maxEntrypointSize: 512000,
    maxAssetSize: 512000
  }
};
