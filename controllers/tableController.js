const { supabase } = require('../config/supabase');
const { generateQr, deleteQr } = require('../utils/qr');

// Get all tables for restaurant
const getTables = async (req, res) => {
    try {
        const { data: tables, error } = await supabase
            .from('tables')
            .select('*')
            .eq('restaurant_id', req.restaurantId)
            .order('table_number', { ascending: true });

        if (error) {
            throw error;
        }

        res.json({ tables });
    } catch (error) {
        console.error('Get tables error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Create new table
const createTable = async (req, res) => {
    try {
        const { tableNumber } = req.body;

        if (!tableNumber) {
            return res.status(400).json({ error: 'Table number is required' });
        }

        // Check if table number already exists
        const { data: existingTable } = await supabase
            .from('tables')
            .select('id')
            .eq('restaurant_id', req.restaurantId)
            .eq('table_number', tableNumber)
            .single();

        if (existingTable) {
            return res.status(409).json({ error: 'Table number already exists' });
        }

        // Create table
        const { data: table, error } = await supabase
            .from('tables')
            .insert({
                restaurant_id: req.restaurantId,
                table_number: tableNumber
            })
            .select()
            .single();

        if (error) {
            throw error;
        }

        res.status(201).json({
            message: 'Table created successfully',
            table
        });
    } catch (error) {
        console.error('Create table error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Update table
const updateTable = async (req, res) => {
    try {
        const { tableId } = req.params;
        const { tableNumber, isActive } = req.body;

        const updateData = {};
        if (tableNumber !== undefined) updateData.table_number = tableNumber;
        if (isActive !== undefined) updateData.is_active = isActive;

        const { data: table, error } = await supabase
            .from('tables')
            .update(updateData)
            .eq('id', tableId)
            .eq('restaurant_id', req.restaurantId)
            .select()
            .single();

        if (error) {
            throw error;
        }

        if (!table) {
            return res.status(404).json({ error: 'Table not found' });
        }

        res.json({
            message: 'Table updated successfully',
            table
        });
    } catch (error) {
        console.error('Update table error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Delete table
const deleteTable = async (req, res) => {
    try {
        const { tableId } = req.params;

        // Delete QR code from storage
        await deleteQr(req.restaurantId, tableId);

        // Delete table from database
        const { error } = await supabase
            .from('tables')
            .delete()
            .eq('id', tableId)
            .eq('restaurant_id', req.restaurantId);

        if (error) {
            throw error;
        }

        res.json({ message: 'Table deleted successfully' });
    } catch (error) {
        console.error('Delete table error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Generate QR code for table
const generateTableQr = async (req, res) => {
    try {
        const { tableId } = req.params;
        const { domain } = req.body;

        // Get table info
        const { data: table, error: tableError } = await supabase
            .from('tables')
            .select('*')
            .eq('id', tableId)
            .eq('restaurant_id', req.restaurantId)
            .single();

        if (tableError || !table) {
            return res.status(404).json({ error: 'Table not found' });
        }

        // Generate QR code
        const qrData = await generateQr(
            req.restaurantId,
            tableId,
            table.table_number,
            domain
        );

        // Update table with QR code URL
        const { error: updateError } = await supabase
            .from('tables')
            .update({ qr_code_url: qrData.url })
            .eq('id', tableId);

        if (updateError) {
            throw updateError;
        }

        res.json({
            message: 'QR code generated successfully',
            qrData
        });
    } catch (error) {
        console.error('Generate QR error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Generate QR codes for all tables
const generateAllQrs = async (req, res) => {
    try {
        const { domain } = req.body;

        // Get all tables
        const { data: tables, error: tablesError } = await supabase
            .from('tables')
            .select('*')
            .eq('restaurant_id', req.restaurantId);

        if (tablesError) {
            throw tablesError;
        }

        const results = [];

        for (const table of tables) {
            try {
                const qrData = await generateQr(
                    req.restaurantId,
                    table.id,
                    table.table_number,
                    domain
                );

                // Update table with QR code URL
                await supabase
                    .from('tables')
                    .update({ qr_code_url: qrData.url })
                    .eq('id', table.id);

                results.push({
                    tableId: table.id,
                    tableNumber: table.table_number,
                    success: true,
                    qrData
                });
            } catch (qrError) {
                results.push({
                    tableId: table.id,
                    tableNumber: table.table_number,
                    success: false,
                    error: qrError.message
                });
            }
        }

        res.json({
            message: 'QR codes generation completed',
            results
        });
    } catch (error) {
        console.error('Generate all QR error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

module.exports = {
    getTables,
    createTable,
    updateTable,
    deleteTable,
    generateTableQr,
    generateAllQrs
};