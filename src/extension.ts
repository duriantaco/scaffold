import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

class ScaffoldPanel {
    public static currentPanel: ScaffoldPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._panel.webview.html = this._getWebviewContent();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        
        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'createStructure':
                        const targetFolder = await vscode.window.showOpenDialog({
                            canSelectFiles: false,
                            canSelectFolders: true,
                            canSelectMany: false,
                            openLabel: 'Select Project Location'
                        });

                        if (!targetFolder) {
                            return;
                        }

                        try {
                            console.log('Parsing structure:', message.text);
                            const structure = parseDirectoryStructure(message.text);
                            console.log('Parsed structure:', structure);
                            
                            await createStructure(targetFolder[0].fsPath, structure);
                            vscode.window.showInformationMessage('Project scaffolded successfully!');
                            
                            panel.webview.postMessage({ command: 'success' });
                        } catch (error: any) {
                            console.error('Error creating structure:', error);
                            vscode.window.showErrorMessage(`Error: ${error.message}`);
                            
                            panel.webview.postMessage({ 
                                command: 'error',
                                text: error.message
                            });
                        }
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (ScaffoldPanel.currentPanel) {
            ScaffoldPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'scaffoldProjectStructure',
            'Scaffold Project Structure',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true
            }
        );

        ScaffoldPanel.currentPanel = new ScaffoldPanel(panel, extensionUri);
    }

    private _getWebviewContent() {
        return `<!DOCTYPE html>
        <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    body { 
                        padding: 20px;
                        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                    }
                    textarea {
                        width: 100%;
                        height: 300px;
                        margin-bottom: 20px;
                        font-family: monospace;
                        padding: 10px;
                    }
                    button {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 8px 16px;
                        cursor: pointer;
                    }
                    button:hover {
                        background: var(--vscode-button-hoverBackground);
                    }
                    .example {
                        background: var(--vscode-editor-background);
                        padding: 10px;
                        margin: 10px 0;
                        font-family: monospace;
                        white-space: pre;
                    }
                </style>
            </head>
            <body>
                <h2>Create Project Structure</h2>
                <p>Enter your directory structure below. Example format:</p>
                <div class="example">
                ├── src/
                │   ├── index.js
                │   └── styles.css
                └── README.md</div>
                <textarea id="treeInput" placeholder="Enter your directory structure here..."></textarea>
                <button onclick="createStructure()">Create Structure</button>
                <div id="status" style="margin-top: 10px; color: var(--vscode-textLink-foreground);"></div>
                <script>
                    const vscode = acquireVsCodeApi();
                    
                    function createStructure() {
                        const treeText = document.getElementById('treeInput').value;
                        if (!treeText.trim()) {
                            alert('Please enter a directory structure');
                            return;
                        }
                        
                        try {
                            vscode.postMessage({
                                command: 'createStructure',
                                text: treeText
                            });
                        } catch (error) {
                            alert('Error sending message: ' + error.message);
                        }
                    }

                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.command) {
                            case 'success':
                                document.getElementById('status').innerText = 'Structure created successfully!';
                                break;
                            case 'error':
                                document.getElementById('status').innerText = 'Error: ' + message.text;
                                break;
                        }
                    });
                </script>
            </body>
        </html>`;
    }

    public dispose() {
        ScaffoldPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}

export function activate(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand('project-scaffold.scaffold', () => {
        ScaffoldPanel.createOrShow(context.extensionUri);
    });

    context.subscriptions.push(disposable);
}

interface FileStructure {
    [key: string]: string[];
}

function parseDirectoryStructure(text: string): FileStructure {
    const lines = text.split('\n');
    
    const minIndent = lines
        .filter(line => line.trim())
        .reduce((min, line) => {
            const leadingSpacesMatch = line.match(/^[\s│]*/);
            const leadingSpaces = leadingSpacesMatch ? leadingSpacesMatch[0].length : 0;
            return Math.min(min, leadingSpaces);
        }, Infinity);

    const normalizedLines = lines.map(line => 
        line.slice(minIndent)
    );

    const structure: FileStructure = {};
    let currentPath: string[] = [];

    normalizedLines.forEach(line => {
        if (!line.trim()) {
            return;
        }

        const indentMatch = line.match(/│|\s/g);
        const indent = indentMatch ? Math.floor(indentMatch.length / 2) : 0;
        
        const cleanLine = line.replace(/[│├└─\s]/g, '').trim();
        
        currentPath = currentPath.slice(0, indent);
        
        if (cleanLine.endsWith('/')) {
            const dirName = cleanLine;
            currentPath.push(dirName);
            const fullPath = currentPath.join('');
            if (!structure[fullPath]) {
                structure[fullPath] = [];
            }
        } else {
            const parentDir = currentPath.join('') || '';
            if (!structure[parentDir]) {
                structure[parentDir] = [];
            }
            structure[parentDir].push(cleanLine);
        }
    });

    return structure;
}

async function createStructure(basePath: string, structure: FileStructure) {
    for (const dir of Object.keys(structure)) {
        if (dir) { 
            const fullDirPath = path.join(basePath, dir);
            await fs.promises.mkdir(fullDirPath, { recursive: true });
        }
    }

    for (const [dir, files] of Object.entries(structure)) {
        const dirPath = path.join(basePath, dir);
        for (const file of files) {
            const filePath = path.join(dirPath, file);
            await fs.promises.writeFile(filePath, '', 'utf8');
        }
    }
}

export function deactivate() {}