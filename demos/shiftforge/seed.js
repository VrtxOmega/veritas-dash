function seedRealData() {
  const names = [
    "Alice Johnson", "Bob Smith", "Charlie Davis", "Diana Prince", 
    "Ethan Hunt", "Fiona Gallagher", "George Costanza", "Hannah Abbott", 
    "Ian Malcolm", "Julia Roberts", "Kevin Bacon", "Laura Croft"
  ];
  const roles = [
    "Manager", "Barista", "Barista", "Cashier", 
    "Cashier", "Barista", "Barista", "Manager", 
    "Cashier", "Barista", "Barista", "Cashier"
  ];
  
  data.employees = [];
  data.availability = {};
  data.compatibility = {};
  data.scheduleHistory = [];

  // Add 12 employees
  names.forEach((name, i) => {
    const id = 'emp_' + i;
    data.employees.push({ id, name, role: roles[i], traits: [] });
    data.availability[id] = {};
    DAYS.forEach(day => {
      data.availability[id][day] = {};
      data.shifts.forEach(shift => {
        // Dynamic availability: ~80% available
        data.availability[id][day][shift.id] = Math.random() > 0.2 ? 'available' : 'unavailable';
      });
    });
  });

  // Force hard conflicts (-2) to simulate severe interpersonal issues
  const conflicts = [
    ['emp_1', 'emp_2'], // Bob and Charlie
    ['emp_4', 'emp_5'], // Ethan and Fiona
    ['emp_0', 'emp_7'], // Alice and Hannah (Managers)
  ];

  conflicts.forEach(([a, b]) => {
    data.compatibility[compatKey(a, b)] = -2;
    data.compatibility[compatKey(b, a)] = -2;
  });

  // Generate 6 weeks of historical schedules
  for (let week = 1; week <= 6; week++) {
    const d = new Date();
    d.setDate(d.getDate() - (7 * week));
    
    // Simulate a past schedule
    let pastSched = {};
    let empCount = {};
    DAYS.forEach(day => {
      pastSched[day] = {};
      data.shifts.forEach(shift => {
        // Randomly assign 2-3 people who don't conflict
        let assigned = [];
        let availableEmps = [...data.employees].sort(() => 0.5 - Math.random());
        for (let e of availableEmps) {
          if (assigned.length >= 3) break;
          // Check conflict with already assigned
          let hasConflict = false;
          for (let a of assigned) {
             if (data.compatibility[compatKey(e.id, a)] <= -2) hasConflict = true;
          }
          if (!hasConflict && data.availability[e.id][day][shift.id] !== 'unavailable') {
             assigned.push(e.id);
             empCount[e.id] = (empCount[e.id] || 0) + 1;
          }
        }
        pastSched[day][shift.id] = assigned;
      });
    });
    
    data.scheduleHistory.push({
      schedule: pastSched,
      startDate: d.toISOString().split('T')[0],
      savedAt: d.toISOString(),
      quality: Math.floor(Math.random() * 20) + 80, // 80-100%
      empShiftCount: empCount,
      conflicts: []
    });
  }

  document.getElementById('min-per-shift').value = 3;

  save();
  renderEmployees();
  renderAvailabilityGrid();
  renderCompatGrid();
  renderHistory();
  showToast('6 Weeks of Dynamic Test Data Seeded', 'success');
}
seedRealData();
