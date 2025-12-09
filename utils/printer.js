// ESC/POS printer integration
const generateESCPOS = (orderData) => {
    const ESC = '\x1B';
    const GS = '\x1D';
    const LF = '\n';

    let receipt = '';
    
    // Initialize printer
    receipt += ESC + '@';
    
    // Center alignment
    receipt += ESC + 'a' + '\x01';
    
    // Large text for restaurant name
    receipt += ESC + '!' + '\x30';
    receipt += orderData.restaurantName + LF + LF;
    
    // Normal text
    receipt += ESC + '!' + '\x00';
    receipt += '================================' + LF;
    
    // Order info
    receipt += ESC + 'a' + '\x00'; // Left alignment
    receipt += 'Order #' + orderData.orderNumber + LF;
    receipt += 'Table: ' + orderData.tableNumber + LF;
    receipt += 'Date: ' + new Date().toLocaleString() + LF;
    receipt += '================================' + LF;
    
    // Items
    receipt += ESC + '!' + '\x01'; // Emphasized
    receipt += 'ITEMS:' + LF;
    receipt += ESC + '!' + '\x00'; // Normal
    
    orderData.items.forEach(item => {
        receipt += item.quantity + 'x ' + item.name + LF;
        if (item.specialInstructions) {
            receipt += '   → ' + item.specialInstructions + LF;
        }
        receipt += '   $' + item.totalPrice.toFixed(2) + LF;
    });
    
    receipt += '================================' + LF;
    
    // Total
    receipt += ESC + '!' + '\x30'; // Large
    receipt += 'TOTAL: $' + orderData.totalAmount.toFixed(2) + LF + LF;
    
    // Notes
    if (orderData.notes) {
        receipt += ESC + '!' + '\x00';
        receipt += 'Notes: ' + orderData.notes + LF;
    }
    
    // Cut paper
    receipt += GS + 'V' + '\x41' + '\x03';
    
    return receipt;
};

// Main print function
const printOrder = async (orderData, printerConfig = {}) => {
    try {
        if (printerConfig.type !== 'escpos') {
            throw new Error('Only ESC/POS printers are supported in this build');
        }

        const escposData = generateESCPOS(orderData);

        return {
            success: true,
            type: 'escpos',
            data: escposData,
            connectionString: printerConfig.connectionString || null,
            message: 'ESCPOS data generated successfully'
        };
    } catch (error) {
        console.error('Print order error:', error);
        throw error;
    }
};

module.exports = {
    printOrder,
    generateESCPOS
};