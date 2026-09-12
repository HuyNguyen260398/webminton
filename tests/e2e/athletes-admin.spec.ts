import {test,expect} from '@playwright/test';
test('athlete page supports deep links and shows a clean empty roster',async({page,request})=>{
 await page.goto('/van-dong-vien/');await page.reload();await expect(page.getByRole('heading',{name:'Vận động viên',exact:true})).toBeVisible();await expect(page.getByText('Chưa có VĐV đăng ký.')).toBeVisible();
 const t=await (await request.get('/api/public/tournament')).json();expect(JSON.stringify(t)).not.toContain('feePayments');expect(JSON.stringify(t)).not.toContain('phone');
});
test('admin settings require login and authorized session can edit',async({page})=>{
 await page.goto('/quan-tri/');await expect(page.getByRole('button',{name:'Đăng nhập BTC',exact:true})).toBeVisible();
 await page.evaluate(()=>sessionStorage.setItem('webminton.session',JSON.stringify({accessToken:'local-test-token',expiresAt:Date.now()+3600000})));
 await page.reload();await expect(page.getByRole('heading',{name:'Cấu hình giải',exact:true})).toBeVisible();
 const input=page.getByLabel('Tên giải',{exact:true});await input.fill('Giải cầu lông nội bộ 2026');await page.getByRole('button',{name:'Lưu thông tin giải',exact:true}).click();await expect(page.getByText('Đã lưu thay đổi.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Đăng xuất',exact:true}).click();await expect(page.getByRole('button',{name:'Đăng nhập BTC',exact:true})).toBeVisible();
});
