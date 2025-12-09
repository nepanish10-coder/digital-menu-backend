const crypto = require('crypto');
const { supabase } = require('../config/supabase');

const buildTicketId = () => `TKT-${crypto.randomUUID().split('-')[0].toUpperCase()}`;
const buildTrackCode = () => String(Math.floor(Math.random() * 1000)).padStart(3, '0');
const cleanText = (value) => (typeof value === 'string' ? value.trim() : '');
const parseDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return null;
    }
    return date.toISOString();
};

const derivePrinterStatus = (printer = {}) => {
    if (printer.is_active === false) return 'offline';
    const missingPrintnode = printer.printer_type === 'printnode' && !printer.printnode_id;
    const missingEscpos = printer.printer_type === 'escpos' && !printer.connection_string;
    if (missingPrintnode || missingEscpos) {
        return 'disconnected';
    }
    return 'active';
};

const formatPrinter = (printer) => ({
    id: printer.id,
    name: printer.name,
    type: printer.printer_type,
    status: derivePrinterStatus(printer),
    updatedAt: printer.updated_at
});

const formatLabelRecord = (record, menuItemLookup = new Map()) => ({
    id: record.id,
    menuItemId: record.menu_item_id,
    menuItemName: menuItemLookup.get(record.menu_item_id) || record.label_name,
    labelName: record.label_name,
    ticketId: record.ticket_id,
    preparedBy: record.prepared_by,
    preparedAt: record.prepared_at,
    expiresAt: record.expires_at,
    printedBy: record.printed_by,
    printedAt: record.printed_at,
    trackCode: record.track_code,
    notes: record.notes,
    createdAt: record.created_at,
    updatedAt: record.updated_at
});

const normalizePayload = (body = {}) => {
    const errors = [];
    const menuItemId = cleanText(body.menuItemId || body.menu_item_id);
    if (!menuItemId) {
        errors.push('Select a menu item');
    }

    const labelName = cleanText(body.labelName || body.label_name);
    if (!labelName) {
        errors.push('Label name is required');
    }

    const preparedAt = parseDate(body.preparedAt || body.prepared_at);
    if (!preparedAt) {
        errors.push('Prepared date/time is required');
    }

    const expiresAt = parseDate(body.expiresAt || body.expires_at);
    if (!expiresAt) {
        errors.push('Expiry date/time is required');
    }

    const payload = {
        menu_item_id: menuItemId || null,
        label_name: labelName || null,
        ticket_id: cleanText(body.ticketId || body.ticket_id) || null,
        prepared_by: cleanText(body.preparedBy || body.prepared_by) || null,
        prepared_at: preparedAt,
        expires_at: expiresAt,
        printed_by: cleanText(body.printedBy || body.printed_by) || null,
        printed_at: parseDate(body.printedAt || body.printed_at) || null,
        track_code: cleanText(body.trackCode || body.track_code) || null,
        notes: cleanText(body.notes) || null
    };

    if (!payload.ticket_id) {
        payload.ticket_id = buildTicketId();
    }
    if (!payload.track_code || payload.track_code.length !== 3) {
        payload.track_code = buildTrackCode();
    }
    if (!payload.printed_at) {
        payload.printed_at = new Date().toISOString();
    }

    return { payload, errors };
};

const fetchMenuItems = async (restaurantId) => {
    const { data, error } = await supabase
        .from('menu_items')
        .select('id, name')
        .eq('restaurant_id', restaurantId)
        .order('name', { ascending: true });

    if (error) throw error;
    return data || [];
};

const fetchPrinters = async (restaurantId) => {
    const { data, error } = await supabase
        .from('printers')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('updated_at', { ascending: false });

    if (error) throw error;
    return data || [];
};

const listLabels = async (req, res) => {
    try {
        const [menuItems, printerRows, labelRowsResult] = await Promise.all([
            fetchMenuItems(req.restaurantId),
            fetchPrinters(req.restaurantId),
            supabase
                .from('item_labels')
                .select('*')
                .eq('restaurant_id', req.restaurantId)
                .order('created_at', { ascending: false })
        ]);

        if (labelRowsResult.error) {
            throw labelRowsResult.error;
        }

        const lookup = new Map(menuItems.map((item) => [item.id, item.name]));
        const labels = (labelRowsResult.data || []).map((record) => formatLabelRecord(record, lookup));
        const printers = printerRows.map(formatPrinter);

        res.json({ labels, menuItems, printers });
    } catch (error) {
        console.error('List labels error:', error);
        res.status(500).json({ error: 'Unable to load labels' });
    }
};

const createLabel = async (req, res) => {
    try {
        const { payload, errors } = normalizePayload(req.body);
        if (errors.length) {
            return res.status(400).json({ error: errors[0], errors });
        }

        const insertPayload = {
            restaurant_id: req.restaurantId,
            ...payload
        };

        const { data, error } = await supabase
            .from('item_labels')
            .insert(insertPayload)
            .select('*')
            .single();

        if (error) {
            throw error;
        }

        const menuItems = await fetchMenuItems(req.restaurantId);
        const lookup = new Map(menuItems.map((item) => [item.id, item.name]));

        res.status(201).json({
            label: formatLabelRecord(data, lookup),
            message: 'Label created'
        });
    } catch (error) {
        console.error('Create label error:', error);
        res.status(500).json({ error: 'Unable to create label' });
    }
};

const updateLabel = async (req, res) => {
    try {
        const { labelId } = req.params;
        const { payload, errors } = normalizePayload(req.body);
        if (errors.length) {
            return res.status(400).json({ error: errors[0], errors });
        }

        const { data, error } = await supabase
            .from('item_labels')
            .update(payload)
            .eq('id', labelId)
            .eq('restaurant_id', req.restaurantId)
            .select('*')
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({ error: 'Label not found' });
            }
            throw error;
        }

        const menuItems = await fetchMenuItems(req.restaurantId);
        const lookup = new Map(menuItems.map((item) => [item.id, item.name]));

        res.json({
            label: formatLabelRecord(data, lookup),
            message: 'Label updated'
        });
    } catch (error) {
        console.error('Update label error:', error);
        res.status(500).json({ error: 'Unable to update label' });
    }
};

const deleteLabel = async (req, res) => {
    try {
        const { labelId } = req.params;
        const { data, error } = await supabase
            .from('item_labels')
            .delete()
            .eq('id', labelId)
            .eq('restaurant_id', req.restaurantId)
            .select('id')
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({ error: 'Label not found' });
            }
            throw error;
        }

        res.json({ message: 'Label deleted', id: data?.id || labelId });
    } catch (error) {
        console.error('Delete label error:', error);
        res.status(500).json({ error: 'Unable to delete label' });
    }
};

module.exports = {
    listLabels,
    createLabel,
    updateLabel,
    deleteLabel
};
