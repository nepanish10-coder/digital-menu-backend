const { supabase } = require('../config/supabase');

const getPrinters = async (req, res) => {
    try {
        const { data: printers, error } = await supabase
            .from('printers')
            .select('id, name, printer_type, is_active')
            .eq('restaurant_id', req.restaurantId)
            .eq('is_active', true)
            .order('name', { ascending: true });

        if (error) {
            throw error;
        }

        res.json({ printers: printers || [] });
    } catch (error) {
        console.error('Get printers error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

module.exports = {
    getPrinters
};
