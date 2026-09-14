import { test, expect } from '@playwright/test';

test('Arabic mobile navigation, goals, centers, programs, language and preferences', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await expect(page.getByRole('heading',{level:1})).toContainText('يا هلا');
  await expect(page.locator('html')).toHaveAttribute('dir','rtl');
  await page.getByRole('button',{name:'أطوّر مسيرتي',exact:true}).click();
  await expect(page.getByRole('button',{name:'أطوّر مسيرتي',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.locator('.mobile-nav').getByRole('button',{name:'اكتشف برامجنا'}).click();
  await expect(page.getByText('السعر حسب مستواك وهدفك').first()).toBeVisible();
  await page.locator('.mobile-nav').getByRole('button',{name:'مراكزنا',exact:true}).click();
  await expect(page.locator('.center-card')).toHaveCount(8);
  await page.getByRole('textbox',{name:'ابحث عن مركز'}).fill('الخبر');
  await expect(page.locator('.center-card')).toHaveCount(1);
  await expect(page.locator('.center-card a')).toHaveAttribute('href','tel:+966138873999');
  await page.getByRole('textbox',{name:'ابحث عن مركز'}).fill('unknown');
  await expect(page.getByText('ما لقينا المركز في هذي القائمة')).toBeVisible();
  await page.getByRole('button',{name:'Switch to English'}).click();
  await expect(page.locator('html')).toHaveAttribute('dir','ltr');
  await page.locator('.mobile-nav').getByRole('button',{name:'Preferences'}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('chat success and retry preserve the learner message', async ({page})=>{
  await page.goto('/');
  let fail=true;
  await page.route('**/api/chat', route=>route.fulfill({status:fail?503:200,contentType:'application/json',body:JSON.stringify(fail?{detail:'Please try again'}:{reply:'يا هلا! خلّنا نبدأ بهدفك.'})}));
  await page.getByRole('button',{name:'تفضّل الكتابة؟',exact:false}).click();
  await page.getByRole('textbox',{name:'رسالتك لهلا'}).fill('أبي أتعلم إنجليزي');
  await page.getByRole('button',{name:'إرسال',exact:true}).click();
  await expect(page.locator('.error-notice[role=alert]')).toContainText('Please try again');
  await expect(page.getByRole('textbox',{name:'رسالتك لهلا'})).toHaveValue('أبي أتعلم إنجليزي');
  fail=false;
  await page.getByRole('button',{name:'إرسال',exact:true}).click();
  await expect(page.getByText('يا هلا! خلّنا نبدأ بهدفك.')).toBeVisible();
});

test('microphone denial offers text without leaving a stuck connection',async({page})=>{
  await page.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Denied','NotAllowedError')}});
  await page.goto('/');
  await page.getByRole('button',{name:'يلا، نتكلم'}).click();
  await expect(page.locator('.error-notice[role=alert]')).toContainText('اسمح للميكروفون');
  await expect(page.getByRole('button',{name:'يلا، نتكلم'})).toBeEnabled();
});
