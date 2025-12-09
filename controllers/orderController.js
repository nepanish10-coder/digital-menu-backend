const { supabase } = require('../config/supabase');
const { printOrder } = require('../utils/printer');

const fetchTableForManualOrder = async (restaurantId, { tableId, tableNumber }) => {
    if (!tableId && !tableNumber) {
        return { error: 'Table identifier required' };
    }

    let query = supabase
        .from('tables')
        .select('id, restaurant_id, table_number, is_active')
        .eq('restaurant_id', restaurantId)
        .limit(1);

    if (tableId) {
        query = query.eq('id', tableId);
    } else {
        query = query.eq('table_number', tableNumber);
    }

    const { data: table, error } = await query.single();
    if (error || !table) {
        return { error: 'Table not found' };
    }
    if (!table.is_active) {
        return { error: 'Table is inactive' };
    }
    return { table };
};

const buildManualOrderItems = async (restaurantId, items = []) => {
    if (!Array.isArray(items) || !items.length) {
        return { orderItems: [], total: 0 };
    }

    const orderItems = [];
    let total = 0;

    for (const item of items) {
        const menuItemId = item?.menuItemId;
        const quantity = Number(item?.quantity) || 0;
        if (!menuItemId || quantity <= 0) {
            return { error: 'Invalid menu item selection' };
        }

        const { data: menuItem, error } = await supabase
            .from('menu_items')
            .select('id, name, price')
            .eq('id', menuItemId)
            .eq('restaurant_id', restaurantId)
            .single();

        if (error || !menuItem) {
            return { error: `Menu item ${menuItemId} not found` };
        }

        const unitPrice = Number(menuItem.price) || 0;
        const lineTotal = unitPrice * quantity;
        total += lineTotal;
        orderItems.push({
            menu_item_id: menuItem.id,
            item_name: menuItem.name,
            quantity,
            unit_price: unitPrice,
            total_price: lineTotal,
            special_instructions: item?.specialInstructions || null
        });
    }

    return { orderItems, total };
};

const buildManualNotes = (summary, paymentMethod) => {
    const parts = [];
    if (summary?.trim()) {
        parts.push(summary.trim());
    }
    if (paymentMethod?.trim()) {
        parts.push(`Payment: ${paymentMethod.trim()}`);
    }
    if (!parts.length) {
        return 'Manual order';
    }
    return `Manual order • ${parts.join(' • ')}`;
};

// Customer creates order
const createOrder = async (req, res) => {
    try {
        const { 
            restaurantId: restaurantIdFromBody, 
            tableId, 
            customerName, 
            customerPhone, 
            items, 
            notes 
        } = req.body;

        if (!tableId || !items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Table ID and at least one item are required' });
        }

        // Get table info and derive restaurant context
        const { data: table, error: tableError } = await supabase
            .from('tables')
            .select('id, restaurant_id, table_number, is_active')
            .eq('id', tableId)
            .single();

        if (tableError || !table) {
            return res.status(404).json({ error: 'Table not found' });
        }

        if (!table.is_active) {
            return res.status(403).json({ error: 'Table is inactive' });
        }

        if (restaurantIdFromBody && restaurantIdFromBody !== table.restaurant_id) {
            return res.status(400).json({ error: 'Restaurant mismatch for provided table' });
        }

        const restaurantId = table.restaurant_id;

        // Calculate total amount and prepare order items
        let totalAmount = 0;
        const orderItems = [];

        for (const item of items) {
            const { data: menuItem, error: itemError } = await supabase
                .from('menu_items')
                .select('name, price')
                .eq('id', item.menuItemId)
                .eq('restaurant_id', restaurantId)
                .single();

            if (itemError || !menuItem) {
                return res.status(400).json({ error: `Menu item ${item.menuItemId} not found` });
            }

            const itemTotal = menuItem.price * item.quantity;
            totalAmount += itemTotal;

            orderItems.push({
                menu_item_id: item.menuItemId,
                item_name: menuItem.name,
                quantity: item.quantity,
                unit_price: menuItem.price,
                total_price: itemTotal,
                special_instructions: item.specialInstructions || null
            });
        }

        // Create order
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .insert({
                restaurant_id: restaurantId,
                table_id: tableId,
                table_number: table.table_number,
                customer_name: customerName,
                customer_phone: customerPhone,
                total_amount: totalAmount,
                notes: notes
            })
            .select()
            .single();

        if (orderError) {
            throw orderError;
        }

        // Create order items
        const orderItemsWithOrderId = orderItems.map(item => ({
            ...item,
            order_id: order.id
        }));

        const { error: itemsError } = await supabase
            .from('order_items')
            .insert(orderItemsWithOrderId);

        if (itemsError) {
            // Rollback order if items creation fails
            await supabase.from('orders').delete().eq('id', order.id);
            throw itemsError;
        }

        // Get complete order with items
        const { data: completeOrder, error: completeError } = await supabase
            .from('orders')
            .select(`
                *,
                order_items(*)
            `)
            .eq('id', order.id)
            .single();

        if (completeError) {
            throw completeError;
        }

        res.status(201).json({
            message: 'Order created successfully',
            order: completeOrder
        });
    } catch (error) {
        console.error('Create order error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const createManualOrder = async (req, res) => {
    try {
        const { tableId, tableNumber, customerName, summary, totalAmount, paymentMethod, items } = req.body;

        if (!tableId && !tableNumber) {
            return res.status(400).json({ error: 'Table selection is required' });
        }

        const { table, error: tableError } = await fetchTableForManualOrder(req.restaurantId, { tableId, tableNumber });
        if (tableError) {
            const statusCode = tableError === 'Table not found' ? 404 : 400;
            return res.status(statusCode).json({ error: tableError });
        }
        if (!table) {
            return res.status(404).json({ error: 'Table not found' });
        }

        const { orderItems, total: computedTotal, error: itemsBuildError } = await buildManualOrderItems(req.restaurantId, items);
        if (itemsBuildError) {
            return res.status(400).json({ error: itemsBuildError });
        }

        const parsedAmount = Number(totalAmount);
        const hasLinkedItems = orderItems.length > 0;
        if (!hasLinkedItems && (!Number.isFinite(parsedAmount) || parsedAmount <= 0)) {
            return res.status(400).json({ error: 'Total amount must be greater than zero' });
        }

        const finalTotal = hasLinkedItems ? computedTotal : parsedAmount;

        const { data: orderRecord, error: orderError } = await supabase
            .from('orders')
            .insert({
                restaurant_id: req.restaurantId,
                table_id: table.id,
                table_number: table.table_number,
                customer_name: customerName?.trim() || null,
                total_amount: finalTotal,
                notes: buildManualNotes(summary, paymentMethod)
            })
            .select('*')
            .single();

        if (orderError) {
            throw orderError;
        }

        if (hasLinkedItems) {
            const orderItemsWithOrderId = orderItems.map((item) => ({
                ...item,
                order_id: orderRecord.id
            }));

            const { error: itemsError } = await supabase
                .from('order_items')
                .insert(orderItemsWithOrderId);

            if (itemsError) {
                await supabase.from('orders').delete().eq('id', orderRecord.id);
                throw itemsError;
            }
        }

        const { data: completeOrder, error: fetchError } = await supabase
            .from('orders')
            .select(`*, order_items(*)`)
            .eq('id', orderRecord.id)
            .single();

        if (fetchError) {
            throw fetchError;
        }

        res.status(201).json({
            message: 'Manual order created',
            order: completeOrder
        });
    } catch (error) {
        console.error('Create manual order error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Get orders by status
const getOrdersByStatus = async (req, res) => {
    try {
        const { status } = req.params;
        const validStatuses = ['pending', 'accepted', 'cooking', 'finished', 'rejected'];

        if (status && !validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        let query = supabase
            .from('orders')
            .select(`
                *,
                order_items(*)
            `)
            .eq('restaurant_id', req.restaurantId)
            .order('created_at', { ascending: false });

        if (status) {
            query = query.eq('status', status);
        }

        const { data: orders, error } = await query;

        if (error) {
            throw error;
        }

        res.json({ orders });
    } catch (error) {
        console.error('Get orders by status error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Accept order
const acceptOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { preparationTime } = req.body;

        const { data: order, error } = await supabase
            .from('orders')
            .update({
                status: 'accepted',
                preparation_time: preparationTime || null,
                accepted_at: new Date().toISOString()
            })
            .eq('id', orderId)
            .eq('restaurant_id', req.restaurantId)
            .select(`
                *,
                order_items(*)
            `)
            .single();

        if (error) {
            throw error;
        }

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        res.json({
            message: 'Order accepted successfully',
            order
        });
    } catch (error) {
        console.error('Accept order error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Reject order
const rejectOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { reason } = req.body;

        const { data: order, error } = await supabase
            .from('orders')
            .update({
                status: 'rejected',
                rejection_reason: reason || 'No reason provided',
                rejected_at: new Date().toISOString()
            })
            .eq('id', orderId)
            .eq('restaurant_id', req.restaurantId)
            .select(`
                *,
                order_items(*)
            `)
            .single();

        if (error) {
            throw error;
        }

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        res.json({
            message: 'Order rejected successfully',
            order
        });
    } catch (error) {
        console.error('Reject order error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Start cooking
const startCooking = async (req, res) => {
    try {
        const { orderId } = req.params;

        const { data: order, error } = await supabase
            .from('orders')
            .update({
                status: 'cooking',
                cooking_started_at: new Date().toISOString()
            })
            .eq('id', orderId)
            .eq('restaurant_id', req.restaurantId)
            .select(`
                *,
                order_items(*)
            `)
            .single();

        if (error) {
            throw error;
        }

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        res.json({
            message: 'Cooking started successfully',
            order
        });
    } catch (error) {
        console.error('Start cooking error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Finish order
const finishOrder = async (req, res) => {
    try {
        const { orderId } = req.params;

        const { data: order, error } = await supabase
            .from('orders')
            .update({
                status: 'finished',
                finished_at: new Date().toISOString()
            })
            .eq('id', orderId)
            .eq('restaurant_id', req.restaurantId)
            .select(`
                *,
                order_items(*)
            `)
            .single();

        if (error) {
            throw error;
        }

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        res.json({
            message: 'Order finished successfully',
            order
        });
    } catch (error) {
        console.error('Finish order error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Print order
const printOrderHandler = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { printerId } = req.body;

        // Get order details
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .select(`
                *,
                order_items(*),
                restaurants(name)
            `)
            .eq('id', orderId)
            .eq('restaurant_id', req.restaurantId)
            .single();

        if (orderError || !order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        // Get printer configuration
        const { data: printer, error: printerError } = await supabase
            .from('printers')
            .select('*')
            .eq('id', printerId)
            .eq('restaurant_id', req.restaurantId)
            .eq('is_active', true)
            .single();

        if (printerError || !printer) {
            return res.status(404).json({ error: 'Printer not found' });
        }

        if (printer.printer_type !== 'escpos') {
            return res.status(400).json({ error: 'Only ESC/POS printers are supported at this time' });
        }

        // Prepare order data for printing
        const orderData = {
            orderNumber: order.id.substring(0, 8).toUpperCase(),
            restaurantName: order.restaurants.name,
            tableNumber: order.table_number,
            customerName: order.customer_name,
            customerPhone: order.customer_phone,
            items: order.order_items.map(item => ({
                name: item.item_name,
                quantity: item.quantity,
                unitPrice: item.unit_price,
                totalPrice: item.total_price,
                specialInstructions: item.special_instructions
            })),
            totalAmount: order.total_amount,
            notes: order.notes,
            createdAt: order.created_at
        };

        // Print order
        const printResult = await printOrder(orderData, {
            type: 'escpos',
            connectionString: printer.connection_string
        });

        res.json({
            message: 'Print job sent successfully',
            printResult
        });
    } catch (error) {
        console.error('Print order handler error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Get order statistics
const getOrderStats = async (req, res) => {
    try {
        const { date } = req.query;
        const startDate = date ? new Date(date) : new Date();
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(startDate);
        endDate.setHours(23, 59, 59, 999);

        // Get order counts by status
        const { data: statusCounts, error: statusError } = await supabase
            .from('orders')
            .select('status', { count: 'exact' })
            .eq('restaurant_id', req.restaurantId)
            .gte('created_at', startDate.toISOString())
            .lte('created_at', endDate.toISOString());

        if (statusError) {
            throw statusError;
        }

        // Get total revenue
        const { data: revenueData, error: revenueError } = await supabase
            .from('orders')
            .select('total_amount')
            .eq('restaurant_id', req.restaurantId)
            .eq('status', 'finished')
            .gte('created_at', startDate.toISOString())
            .lte('created_at', endDate.toISOString());

        if (revenueError) {
            throw revenueError;
        }

        const totalRevenue = revenueData.reduce((sum, order) => sum + order.total_amount, 0);

        // Count by status
        const statusMap = {
            pending: 0,
            accepted: 0,
            cooking: 0,
            finished: 0,
            rejected: 0
        };

        statusCounts.forEach(order => {
            statusMap[order.status] = (statusMap[order.status] || 0) + 1;
        });

        res.json({
            stats: {
                ...statusMap,
                totalRevenue
            }
        });
    } catch (error) {
        console.error('Get order stats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

module.exports = {
    createOrder,
    createManualOrder,
    getOrdersByStatus,
    acceptOrder,
    rejectOrder,
    startCooking,
    finishOrder,
    printOrderHandler,
    getOrderStats
};