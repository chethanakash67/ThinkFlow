#!/bin/bash

# Quick Setup Script for OpenAI Integration
# This script helps you set up the AI-powered logic evaluation

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   🤖 ThinkFlow - OpenAI Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "This will help you enable AI-powered semantic logic evaluation!"
echo ""

# Check if .env exists
if [ ! -f "server/.env" ]; then
    echo "❌ Error: server/.env file not found!"
    echo "   Please create it first."
    exit 1
fi

# Check if API key is already configured
if grep -q "OPENAI_API_KEY=sk-" server/.env 2>/dev/null; then
    echo "✅ OpenAI API Key is already configured!"
    echo ""
    read -p "Do you want to update it? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Keeping existing key. Exiting..."
        exit 0
    fi
fi

echo "📖 Step 1: Get Your API Key"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1. Visit: https://platform.openai.com/api-keys"
echo "2. Sign in with your OpenAI account"
echo "3. Click 'Create new secret key'"
echo "4. Copy your API key"
echo ""

# Open browser (optional)
read -p "Would you like to open this URL in your browser? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if command -v open &> /dev/null; then
        open "https://platform.openai.com/api-keys"
    elif command -v xdg-open &> /dev/null; then
        xdg-open "https://platform.openai.com/api-keys"
    else
        echo "Please open the URL manually: https://platform.openai.com/api-keys"
    fi
fi

echo ""
echo "📝 Step 2: Enter Your API Key"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
read -p "Paste your OpenAI API Key here: " api_key

# Validate API key format
if [[ ! $api_key =~ ^sk- ]]; then
    echo "⚠️  Warning: API key doesn't start with 'sk-' (typical format)"
    read -p "Are you sure this is correct? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Setup cancelled. Please run again with correct key."
        exit 1
    fi
fi

# Update .env file
if grep -q "OPENAI_API_KEY=" server/.env; then
    # Replace existing line
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s|OPENAI_API_KEY=.*|OPENAI_API_KEY=$api_key|" server/.env
    else
        # Linux
        sed -i "s|OPENAI_API_KEY=.*|OPENAI_API_KEY=$api_key|" server/.env
    fi
else
    # Add new line
    echo "" >> server/.env
    echo "OPENAI_API_KEY=$api_key" >> server/.env
fi

if ! grep -q "OPENAI_MODEL=" server/.env; then
    echo "OPENAI_MODEL=gpt-5.4-mini" >> server/.env
fi

echo ""
echo "✅ API Key configured successfully!"
echo ""

# Test the configuration
echo "🧪 Step 3: Test the Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
read -p "Would you like to run a test evaluation? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "Running test..."
    cd server
    node test-ai-evaluation.js
    cd ..
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   🎉 Setup Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Next steps:"
echo "  1. Restart your server: cd server && npm run dev"
echo "  2. Try submitting logic with different phrasings"
echo "  3. See AI understand semantic meaning! 🚀"
echo ""
echo "📚 Documentation:"
echo "  - README.md - Setup guide"
echo "  - AI_EVALUATION_SUMMARY.md - How it works"
echo ""
