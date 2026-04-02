@echo off
REM Script para liberar porta 8080 no Windows Firewall
REM Execute como ADMINISTRADOR

echo Liberando porta 8080 no Windows Firewall...

netsh advfirewall firewall add rule name="AzulCredito-8080" dir=in action=allow protocol=tcp localport=8080 enable=yes

echo.
echo ✅ Porta 8080 liberada com sucesso!
echo.
echo Agora tente acessar do celular:
echo http://192.168.0.17:8080
echo.
pause
