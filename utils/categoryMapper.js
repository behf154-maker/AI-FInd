/**
 * Map AI labels to categories and subcategories
 */
function mapLabelToCategory(label) {
  const labelLower = label.toLowerCase();
  
  // Clothing
  if (labelLower.includes('shirt') || labelLower.includes('t-shirt') || 
      labelLower.includes('clothing') || labelLower.includes('apparel') ||
      labelLower.includes('تيشيرت')) {
    return { category: 'clothing', subcategory: 't-shirt' };
  }
  if (labelLower.includes('pants') || labelLower.includes('jeans') ||
      labelLower.includes('بنطلون')) {
    return { category: 'clothing', subcategory: 'pants' };
  }
  if (labelLower.includes('jacket') || labelLower.includes('coat') ||
      labelLower.includes('جاكيت')) {
    return { category: 'clothing', subcategory: 'jacket' };
  }
  if (labelLower.includes('shoes') || labelLower.includes('sneakers') ||
      labelLower.includes('حذاء')) {
    return { category: 'clothing', subcategory: 'shoes' };
  }
  if (labelLower.includes('hat') || labelLower.includes('cap') ||
      labelLower.includes('قبعة')) {
    return { category: 'clothing', subcategory: 'hat' };
  }
  if (labelLower.includes('sweater') || labelLower.includes('سويتر')) {
    return { category: 'clothing', subcategory: 'sweater' };
  }
  if (labelLower.includes('dress') || labelLower.includes('فستان')) {
    return { category: 'clothing', subcategory: 'dress' };
  }
  
  // Electronics
  if (labelLower.includes('phone') || labelLower.includes('smartphone') ||
      labelLower.includes('موبايل')) {
    return { category: 'electronics', subcategory: 'phone' };
  }
  if (labelLower.includes('watch') || labelLower.includes('smartwatch') ||
      labelLower.includes('ساعة')) {
    return { category: 'electronics', subcategory: 'watch' };
  }
  if (labelLower.includes('laptop') || labelLower.includes('computer') ||
      labelLower.includes('لاب')) {
    return { category: 'electronics', subcategory: 'laptop' };
  }
  if (labelLower.includes('earphones') || labelLower.includes('headphones') ||
      labelLower.includes('سماعات')) {
    return { category: 'electronics', subcategory: 'earphones' };
  }
  if (labelLower.includes('charger') || labelLower.includes('شاحن')) {
    return { category: 'electronics', subcategory: 'charger' };
  }
  if (labelLower.includes('tablet') || labelLower.includes('تابلت')) {
    return { category: 'electronics', subcategory: 'tablet' };
  }
  
  // School Supplies
  if (labelLower.includes('pen') || labelLower.includes('قلم حبر')) {
    return { category: 'school_supplies', subcategory: 'pen' };
  }
  if (labelLower.includes('pencil') || labelLower.includes('قلم رصاص')) {
    return { category: 'school_supplies', subcategory: 'pencil' };
  }
  if (labelLower.includes('notebook') || labelLower.includes('دفتر')) {
    return { category: 'school_supplies', subcategory: 'notebook' };
  }
  if (labelLower.includes('book') || labelLower.includes('كتاب')) {
    return { category: 'school_supplies', subcategory: 'book' };
  }
  if (labelLower.includes('folder') || labelLower.includes('مجلد')) {
    return { category: 'school_supplies', subcategory: 'folder' };
  }
  if (labelLower.includes('calculator') || labelLower.includes('حاسبة')) {
    return { category: 'school_supplies', subcategory: 'calculator' };
  }
  if (labelLower.includes('ruler') || labelLower.includes('مسطرة')) {
    return { category: 'school_supplies', subcategory: 'ruler' };
  }
  
  // Personal Items
  if (labelLower.includes('wallet') || labelLower.includes('محفظة')) {
    return { category: 'personal_items', subcategory: 'wallet' };
  }
  if (labelLower.includes('key') || labelLower.includes('مفتاح')) {
    return { category: 'personal_items', subcategory: 'keys' };
  }
  if (labelLower.includes('bag') || labelLower.includes('حقيبة')) {
    return { category: 'personal_items', subcategory: 'bag' };
  }
  if (labelLower.includes('backpack') || labelLower.includes('حقيبة ظهر')) {
    return { category: 'personal_items', subcategory: 'backpack' };
  }
  if (labelLower.includes('glasses') || labelLower.includes('نظارات')) {
    return { category: 'personal_items', subcategory: 'glasses' };
  }
  
  // Money & Cards
  if (labelLower.includes('money') || labelLower.includes('cash') ||
      labelLower.includes('نقود')) {
    return { category: 'money', subcategory: 'cash' };
  }
  if (labelLower.includes('id card') || labelLower.includes('بطاقة هوية')) {
    return { category: 'money', subcategory: 'id_card' };
  }
  if ((labelLower.includes('card') && !labelLower.includes('credit')) ||
      labelLower.includes('بطاقة')) {
    return { category: 'money', subcategory: 'card' };
  }
  
  // Documents
  if (labelLower.includes('certificate') || labelLower.includes('شهادة')) {
    return { category: 'documents', subcategory: 'certificate' };
  }
  if (labelLower.includes('paper') || labelLower.includes('ورق')) {
    return { category: 'documents', subcategory: 'paper' };
  }
  
  // Accessories
  if (labelLower.includes('jewelry') || labelLower.includes('مجوهرات')) {
    return { category: 'accessories', subcategory: 'jewelry' };
  }
  if (labelLower.includes('bracelet') || labelLower.includes('سوار')) {
    return { category: 'accessories', subcategory: 'bracelet' };
  }
  
  // Sports
  if (labelLower.includes('ball') || labelLower.includes('كرة')) {
    return { category: 'sports', subcategory: 'ball' };
  }
  
  return { category: 'other', subcategory: 'other' };
}

module.exports = { mapLabelToCategory };

