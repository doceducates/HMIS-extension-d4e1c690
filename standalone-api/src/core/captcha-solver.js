/**
 * Automatic Mathematical Captcha Solver for Punjab HMIS
 */
const SELECTORS = require('../config/selectors');

class CaptchaSolver {
    /**
     * Inspects DOM, extracts math operands and operator, computes answer, and fills input
     * @param {import('playwright').Page} page
     */
    static async solve(page) {
        const num1El = await page.$(SELECTORS.LOGIN.CAPTCHA_NUM1);
        const num2El = await page.$(SELECTORS.LOGIN.CAPTCHA_NUM2);

        if (!num1El || !num2El) {
            throw new Error('Captcha input fields not found in login form.');
        }

        const num1 = parseInt(await num1El.getAttribute('value'), 10);
        const num2 = parseInt(await num2El.getAttribute('value'), 10);

        const formText = await page.locator('form').innerText();
        let symbol = '+';
        if (formText.includes('-')) symbol = '-';
        else if (formText.includes('×') || formText.includes('*')) symbol = '*';

        let answer = num1 + num2;
        if (symbol === '-') answer = num1 - num2;
        if (symbol === '*') answer = num1 * num2;

        console.log(`🧩 [CaptchaSolver] Parsed: ${num1} ${symbol} ${num2} = ${answer}`);
        await page.fill(SELECTORS.LOGIN.CAPTCHA_ANSWER, answer.toString());
        return { num1, symbol, num2, answer };
    }
}

module.exports = CaptchaSolver;
