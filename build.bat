@echo off
echo ==================================================
echo         Construindo Executavel do DevLens
echo ==================================================
echo.

REM Verifica se a pasta node_modules existe, se nao, instala as dependencias
if not exist node_modules (
    echo [INFO] Pasta 'node_modules' nao encontrada.
    echo [INFO] Instalando dependencias do projeto, por favor aguarde...
    call npm install
    if errorlevel 1 (
        echo [ERRO] Falha ao instalar dependencias.
        goto error
    )
)

echo.
echo [INFO] Iniciando o processo de compilacao com electron-builder...
call npm run build

if errorlevel 1 (
    goto error
) else (
    echo.
    echo ==================================================
    echo       Compilacao concluida com SUCESSO!
    echo   Os instaladores executaveis estao na pasta: dist/
    echo ==================================================
)

pause
exit /b 0

:error
echo.
echo ==================================================
echo          Ocorreu um ERRO no processo!
echo ==================================================
pause
exit /b 1
