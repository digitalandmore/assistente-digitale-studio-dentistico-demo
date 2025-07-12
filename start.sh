#!/bin/bash

echo "🚀 Avvio Assistente Digitale Studio Dentistico..."
echo

# Verifica se Node.js è installato
if ! command -v node &> /dev/null; then
    echo "❌ Node.js non è installato. Scaricalo da: https://nodejs.org/"
    exit 1
fi

# Verifica se le dipendenze sono installate
if [ ! -d "node_modules" ]; then
    echo "📦 Installazione dipendenze..."
    npm install
fi

echo "🌐 Apertura browser..."
sleep 2
if command -v open &> /dev/null; then
    open http://localhost:3000
elif command -v xdg-open &> /dev/null; then
    xdg-open http://localhost:3000
fi

echo "🚀 Avvio server..."
npm start
