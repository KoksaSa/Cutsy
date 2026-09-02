@echo off
set GIT="C:\Program Files\Git\cmd\git.exe"

echo Инициализация репозитория...
%GIT% init

echo Добавление файлов...
%GIT% add .

echo Первый коммит...
%GIT% commit -m "Initial commit: 2D CAD с раскладкой деталей"

echo.
echo Готово! Теперь создайте репозиторий на GitHub и выполните:
echo.
echo git remote add origin https://github.com/ВАШ_НИК/2d-cad-nesting.git
echo git branch -M main
echo git push -u origin main
echo.
pause
