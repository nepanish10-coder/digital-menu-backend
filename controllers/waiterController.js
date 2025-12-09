const { supabase } = require('../config/supabase');

const sanitizeMessage = (value = '', maxLength = 280) => {
    if (!value) {
        return null;
    }
    return value.toString().trim().slice(0, maxLength) || null;
};

const createCall = async (req, res) => {
    try {
        const { tableId, restaurantId: restaurantIdFromBody, message } = req.body;

        if (!tableId) {
            return res.status(400).json({ error: 'Table ID is required' });
        }

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

        const cleanMessage = sanitizeMessage(message);

        const { data: newCall, error: callError } = await supabase
            .from('waiter_calls')
            .insert({
                restaurant_id: table.restaurant_id,
                table_id: table.id,
                table_number: table.table_number,
                customer_message: cleanMessage,
                status: 'open'
            })
            .select()
            .single();

        if (callError) {
            throw callError;
        }

        res.status(201).json({ call: newCall });
    } catch (error) {
        console.error('Create waiter call error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const getCalls = async (req, res) => {
    try {
        const { status } = req.query;

        let query = supabase
            .from('waiter_calls')
            .select('*')
            .eq('restaurant_id', req.restaurantId)
            .order('created_at', { ascending: false })
            .limit(50);

        if (status) {
            query = query.eq('status', status);
        } else {
            query = query.neq('status', 'resolved');
        }

        const { data: calls, error } = await query;

        if (error) {
            throw error;
        }

        res.json({ calls });
    } catch (error) {
        console.error('Get waiter calls error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const respondToCall = async (req, res) => {
    try {
        const { callId } = req.params;
        const { responseText } = req.body;

        if (!responseText || !responseText.toString().trim()) {
            return res.status(400).json({ error: 'Response text is required' });
        }

        const cleanResponse = sanitizeMessage(responseText, 180);

        const { data: updatedCall, error } = await supabase
            .from('waiter_calls')
            .update({
                status: 'responded',
                response_message: cleanResponse,
                responded_at: new Date().toISOString()
            })
            .eq('id', callId)
            .eq('restaurant_id', req.restaurantId)
            .select('*')
            .single();

        if (error || !updatedCall) {
            return res.status(404).json({ error: 'Waiter call not found' });
        }

        res.json({ call: updatedCall });
    } catch (error) {
        console.error('Respond waiter call error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const resolveCall = async (req, res) => {
    try {
        const { callId } = req.params;

        const { data: resolvedCall, error } = await supabase
            .from('waiter_calls')
            .update({
                status: 'resolved',
                resolved_at: new Date().toISOString()
            })
            .eq('id', callId)
            .eq('restaurant_id', req.restaurantId)
            .select('*')
            .single();

        if (error || !resolvedCall) {
            return res.status(404).json({ error: 'Waiter call not found' });
        }

        res.json({ call: resolvedCall });
    } catch (error) {
        console.error('Resolve waiter call error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const getCallStatus = async (req, res) => {
    try {
        const { callId } = req.params;
        const { tableId } = req.query;

        if (!callId || !tableId) {
            return res.status(400).json({ error: 'Call ID and table ID are required' });
        }

        const { data: call, error } = await supabase
            .from('waiter_calls')
            .select('*')
            .eq('id', callId)
            .eq('table_id', tableId)
            .single();

        if (error || !call) {
            return res.status(404).json({ error: 'Waiter call not found' });
        }

        res.json({ call });
    } catch (error) {
        console.error('Get waiter call status error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

module.exports = {
    createCall,
    getCalls,
    respondToCall,
    resolveCall,
    getCallStatus
};
