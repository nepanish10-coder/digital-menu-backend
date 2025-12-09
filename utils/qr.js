const QRCode = require('qrcode');
const { supabaseService } = require('../config/supabase');

// Generate QR code for table
const generateQr = async (restaurantId, tableId, tableNumber, domain = 'https://yourdomain.com') => {
    try {
        // Create QR code URL
        const menuUrl = `${domain}/menu?rest=${restaurantId}&table=${tableId}`;
        
        // Generate QR code as base64
        const qrBase64 = await QRCode.toDataURL(menuUrl, {
            type: 'image/png',
            quality: 0.92,
            margin: 1,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            },
            width: 300
        });

        // Convert base64 to buffer
        const base64Data = qrBase64.replace(/^data:image\/png;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        
        // Upload to Supabase storage
        const fileName = `qr-codes/${restaurantId}/${tableId}.png`;
        
        const { data, error } = await supabaseService.storage
            .from(process.env.SUPABASE_BUCKET_NAME || 'qr-codes')
            .upload(fileName, buffer, {
                contentType: 'image/png',
                upsert: true
            });

        if (error) {
            throw error;
        }

        // Get public URL
        const { data: publicUrlData } = supabaseService.storage
            .from(process.env.SUPABASE_BUCKET_NAME || 'qr-codes')
            .getPublicUrl(fileName);

        return {
            base64: qrBase64,
            url: publicUrlData.publicUrl,
            menuUrl: menuUrl
        };
    } catch (error) {
        console.error('QR generation error:', error);
        throw error;
    }
};

// Generate multiple QR codes for tables
const generateMultipleQrs = async (restaurantId, tables, domain = 'https://yourdomain.com') => {
    try {
        const results = [];
        
        for (const table of tables) {
            const qrData = await generateQr(restaurantId, table.id, table.table_number, domain);
            results.push({
                tableId: table.id,
                tableNumber: table.table_number,
                ...qrData
            });
        }
        
        return results;
    } catch (error) {
        console.error('Multiple QR generation error:', error);
        throw error;
    }
};

// Delete QR code from storage
const deleteQr = async (restaurantId, tableId) => {
    try {
        const fileName = `qr-codes/${restaurantId}/${tableId}.png`;
        
        const { error } = await supabaseService.storage
            .from(process.env.SUPABASE_BUCKET_NAME || 'qr-codes')
            .remove([fileName]);

        if (error) {
            console.error('Error deleting QR code:', error);
        }
    } catch (error) {
        console.error('QR deletion error:', error);
    }
};

module.exports = {
    generateQr,
    generateMultipleQrs,
    deleteQr
};